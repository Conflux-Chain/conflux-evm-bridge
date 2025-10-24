const { expect } = require('chai');
const { ethers, upgrades, artifacts } = require('hardhat');

describe('UpgradeableERC20', function () {
  it('preserves storage, balances, and behavior after upgrade', async () => {
    const [_deployer, admin, minter, bannedHolder, otherAccount] =
      await ethers.getSigners();

    const erc20V1 = await ethers.getContractFactory('UpgradeableERC20V1');
    const erc20 = await ethers.getContractFactory('UpgradeableERC20');

    const beacon = await upgrades.deployBeacon(erc20V1, {
      // unsafeAllow: ['constructor'],
    });
    const instance = await upgrades.deployBeaconProxy(beacon, erc20V1, [
      'Test Token',
      'TT',
      18,
      admin.address,
    ]);

    const v1 = erc20V1.attach(instance.address);

    const minterRole = await v1.MINTER_ROLE();
    const pauserRole = await v1.PAUSER_ROLE();
    const defaultAdminRole = await v1.DEFAULT_ADMIN_ROLE();

    await v1.connect(admin).grantRole(minterRole, minter.address);

    const minterCap = ethers.utils.parseUnits('1000', 18);
    await v1.connect(admin).setMinterCap(minter.address, minterCap);

    const mintedAmount = ethers.utils.parseUnits('10', 18);
    await v1.connect(minter).mint(bannedHolder.address, mintedAmount);

    const allowanceAmount = ethers.utils.parseUnits('3', 18);
    await v1.connect(bannedHolder).approve(minter.address, allowanceAmount);

    const preUpgradeMinterSupply = await v1.minterSupply(minter.address);

    const layout = await getStorageLayout(
      'UpgradeableERC20V1',
      'contracts/UpgradeableERC20V1.sol',
    );

    const slotRecords = collectBaseSlotRecords(layout.storage);

    const balancesSlot = findSlot(layout.storage, '_balances');
    const balanceAddresses = [
      bannedHolder.address,
      minter.address,
      admin.address,
      otherAccount.address,
    ];
    balanceAddresses.forEach((addr) => {
      slotRecords.push({
        label: `_balances(${addr})`,
        slot: computeMappingSlot(balancesSlot, 'address', addr),
      });
    });

    const allowancesSlot = findSlot(layout.storage, '_allowances');
    const allowanceOwner = bannedHolder.address;
    const allowanceSpender = minter.address;
    const allowancesOuterSlot = computeMappingSlot(
      allowancesSlot,
      'address',
      allowanceOwner,
    );
    slotRecords.push({
      label: `_allowances.outer(${allowanceOwner})`,
      slot: allowancesOuterSlot,
    });
    slotRecords.push({
      label: `_allowances(${allowanceOwner},${allowanceSpender})`,
      slot: computeMappingSlot(allowancesOuterSlot, 'address', allowanceSpender),
    });

    const rolesSlot = findSlot(layout.storage, '_roles');
    const roleMembersSlotBase = findSlot(layout.storage, '_roleMembers');
    const trackedRoles = [
      { name: 'DEFAULT_ADMIN_ROLE', key: defaultAdminRole },
      { name: 'MINTER_ROLE', key: minterRole },
      { name: 'PAUSER_ROLE', key: pauserRole },
    ];

    const roleMembersByRole = {};
    for (const role of trackedRoles) {
      const roleSlot = computeMappingSlot(rolesSlot, 'bytes32', role.key);
      slotRecords.push({
        label: `_roles.admin(${role.name})`,
        slot: addSlot(roleSlot, 1),
      });

      const memberCount = await v1.getRoleMemberCount(role.key);
      roleMembersByRole[role.name] = [];
      for (let i = 0; i < memberCount; i++) {
        const member = await v1.getRoleMember(role.key, i);
        roleMembersByRole[role.name].push(member);
        slotRecords.push({
          label: `_roles.member(${role.name},${member})`,
          slot: computeMappingSlot(roleSlot, 'address', member),
        });
      }

      const roleMembersSlot = computeMappingSlot(
        roleMembersSlotBase,
        'bytes32',
        role.key,
      );
      slotRecords.push({
        label: `_roleMembers.values.length(${role.name})`,
        slot: roleMembersSlot,
      });

      const valuesBaseSlot = computeArrayDataSlot(roleMembersSlot);
      roleMembersByRole[role.name].forEach((member, index) => {
        slotRecords.push({
          label: `_roleMembers.values(${role.name})[${index}]`,
          slot: addSlot(valuesBaseSlot, index),
        });
      });

      const indexesBaseSlot = addSlot(roleMembersSlot, 1);
      roleMembersByRole[role.name].forEach((member) => {
        slotRecords.push({
          label: `_roleMembers.index(${role.name},${member})`,
          slot: computeMappingSlot(
            indexesBaseSlot,
            'bytes32',
            ethers.utils.hexZeroPad(member, 32),
          ),
        });
      });
    }

    const minterSupplySlot = findSlot(layout.storage, 'minterSupply');
    const supplyAddresses = new Set([
      ...roleMembersByRole['MINTER_ROLE'],
      minter.address,
    ]);
    supplyAddresses.forEach((addr) => {
      const supplySlot = computeMappingSlot(
        minterSupplySlot,
        'address',
        addr,
      );
      slotRecords.push({
        label: `minterSupply.cap(${addr})`,
        slot: supplySlot,
      });
      slotRecords.push({
        label: `minterSupply.total(${addr})`,
        slot: addSlot(supplySlot, 1),
      });
    });

    const preUpgradeValues = await readSlotRecords(v1.address, slotRecords);

    const preUpgradeBalances = await Promise.all(
      balanceAddresses.map((addr) => v1.balanceOf(addr)),
    );
    const bannedHolderBalanceBefore = preUpgradeBalances[0];
    const preUpgradeTotalSupply = await v1.totalSupply();

    await upgrades.upgradeBeacon(beacon, erc20, {
      // unsafeAllow: ['constructor'],
    });
    const upgraded = erc20.attach(instance.address);

    const postUpgradeValues = await readSlotRecords(
      upgraded.address,
      slotRecords,
    );

    for (const record of slotRecords) {
      expect(
        postUpgradeValues.get(record.label),
        `slot mismatch for ${record.label}`,
      ).to.equal(preUpgradeValues.get(record.label));
    }

    await Promise.all(
      balanceAddresses.map(async (addr, index) => {
        expect(await upgraded.balanceOf(addr)).to.equal(
          preUpgradeBalances[index],
        );
      }),
    );

    expect(await upgraded.balanceOf(bannedHolder.address)).to.equal(
      bannedHolderBalanceBefore,
    );
    expect(await upgraded.totalSupply()).to.equal(preUpgradeTotalSupply);

    await expect(
      upgraded.initialize('Again', 'AG', 18, admin.address),
    ).to.be.revertedWith('initialized already');

    expect(await upgraded.name()).to.equal('Test Token');
    expect(await upgraded.symbol()).to.equal('TT');

    const minterCapBeforeUpgrade = await upgraded.getMinterCap(minter.address);
    expect(minterCapBeforeUpgrade).to.equal(minterCap);

    const increasedCap = minterCap.add(ethers.utils.parseUnits('500', 18));
    await upgraded.connect(admin).setMinterCap(minter.address, increasedCap);
    expect(await upgraded.getMinterCap(minter.address)).to.equal(increasedCap);

    await upgraded.connect(admin).setMetadata('New Token', 'NWT');
    expect(await upgraded.name()).to.equal('New Token');
    expect(await upgraded.symbol()).to.equal('NWT');

    const extraMint = ethers.utils.parseUnits('5', 18);
    await upgraded.connect(minter).mint(otherAccount.address, extraMint);
    let expectedMinterTotal = preUpgradeMinterSupply.total.add(extraMint);
    let expectedOtherBalance = preUpgradeBalances[3].add(extraMint);
    expect((await upgraded.minterSupply(minter.address)).total).to.equal(
      expectedMinterTotal,
    );
    expect(await upgraded.balanceOf(otherAccount.address)).to.equal(
      expectedOtherBalance,
    );

    const selfBurnAmount = ethers.utils.parseUnits('1', 18);
  await upgraded.connect(otherAccount)['burn(uint256)'](selfBurnAmount);
    expectedOtherBalance = expectedOtherBalance.sub(selfBurnAmount);
    expect(await upgraded.balanceOf(otherAccount.address)).to.equal(
      expectedOtherBalance,
    );

    const burnAllowance = ethers.utils.parseUnits('2', 18);
    const burnFromAmount = ethers.utils.parseUnits('1', 18);
    const burnAliasAmount = ethers.utils.parseUnits('1', 18);
    await upgraded.connect(otherAccount).approve(minter.address, burnAllowance);

    await upgraded
      .connect(minter)
      .burnFrom(otherAccount.address, burnFromAmount);
    expectedOtherBalance = expectedOtherBalance.sub(burnFromAmount);
    expectedMinterTotal = expectedMinterTotal.sub(burnFromAmount);
    expect(await upgraded.balanceOf(otherAccount.address)).to.equal(
      expectedOtherBalance,
    );
    expect((await upgraded.minterSupply(minter.address)).total).to.equal(
      expectedMinterTotal,
    );

    await upgraded
      .connect(minter)
      ['burn(address,uint256)'](otherAccount.address, burnAliasAmount);
    expectedOtherBalance = expectedOtherBalance.sub(burnAliasAmount);
    expectedMinterTotal = expectedMinterTotal.sub(burnAliasAmount);
    expect(await upgraded.balanceOf(otherAccount.address)).to.equal(
      expectedOtherBalance,
    );
    expect((await upgraded.minterSupply(minter.address)).total).to.equal(
      expectedMinterTotal,
    );

    expect(await upgraded.isTransferBanned(bannedHolder.address)).to.equal(
      false,
    );

    await upgraded.connect(admin).setTransferBan(bannedHolder.address, true);
    expect(await upgraded.isTransferBanned(bannedHolder.address)).to.equal(
      true,
    );

    const transferAmount = ethers.utils.parseUnits('1', 18);
    await expect(
      upgraded.connect(bannedHolder).transfer(otherAccount.address, transferAmount),
    ).to.be.revertedWith('UpgradeableERC20: sender banned');

    await upgraded.connect(admin).unbanAddress(bannedHolder.address);
    expect(await upgraded.isTransferBanned(bannedHolder.address)).to.equal(
      false,
    );

    await expect(upgraded.connect(admin).pause()).to.emit(upgraded, 'Paused');
    await expect(
      upgraded.connect(bannedHolder).transfer(otherAccount.address, transferAmount),
    ).to.be.revertedWith('ERC20Pausable: token transfer while paused');
    await expect(upgraded.connect(admin).unpause()).to.emit(
      upgraded,
      'Unpaused',
    );

    await upgraded
      .connect(bannedHolder)
      .transfer(otherAccount.address, transferAmount);
    const bannedHolderPostTransfer = await upgraded.balanceOf(
      bannedHolder.address,
    );
    expectedOtherBalance = expectedOtherBalance.add(transferAmount);
    expect(await upgraded.balanceOf(otherAccount.address)).to.equal(
      expectedOtherBalance,
    );

    await upgraded.connect(bannedHolder).approve(minter.address, transferAmount);
    await upgraded
      .connect(minter)
      .transferFrom(bannedHolder.address, admin.address, transferAmount);
    expect(await upgraded.balanceOf(admin.address)).to.equal(transferAmount);
    expect(
      await upgraded.balanceOf(bannedHolder.address),
    ).to.equal(bannedHolderPostTransfer.sub(transferAmount));

    await upgraded.connect(admin).banAddress(otherAccount.address);
    await expect(
      upgraded.connect(bannedHolder).transfer(otherAccount.address, transferAmount),
    ).to.be.revertedWith('UpgradeableERC20: recipient banned');

    await upgraded.connect(admin).setTransferBan(otherAccount.address, false);
    await upgraded
      .connect(bannedHolder)
      .transfer(otherAccount.address, transferAmount);
  });
});

async function getStorageLayout(contractName, sourcePath) {
  const buildInfo = await artifacts.getBuildInfo(
    `${sourcePath}:${contractName}`,
  );
  if (!buildInfo) {
    throw new Error(`Build info not found for ${contractName}`);
  }
  return buildInfo.output.contracts[sourcePath][contractName].storageLayout;
}

function collectBaseSlotRecords(storageEntries) {
  const grouped = new Map();
  storageEntries.forEach((entry) => {
    const slot = normalizeSlot(entry.slot);
    if (!grouped.has(slot)) {
      grouped.set(slot, new Set());
    }
    grouped.get(slot).add(entry.label);
  });

  const records = [];
  grouped.forEach((labels, slot) => {
    records.push({
      label: `baseSlot(${slot})[${Array.from(labels).join(', ')}]`,
      slot,
    });
  });
  return records;
}

function findSlot(storageEntries, label) {
  const entry = storageEntries.find((item) => item.label === label);
  if (!entry) {
    throw new Error(`slot not found for ${label}`);
  }
  return normalizeSlot(entry.slot);
}

async function readSlotRecords(address, records) {
  const results = new Map();
  for (const record of records) {
    const value = await ethers.provider.getStorageAt(
      address,
      record.slot,
    );
    results.set(record.label, value);
  }
  return results;
}

function computeMappingSlot(baseSlot, keyType, keyValue) {
  const slot = normalizeSlot(baseSlot);
  let key = keyValue;
  if (keyType === 'address') {
    key = ethers.utils.getAddress(keyValue);
  }
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      [keyType, 'uint256'],
      [key, ethers.BigNumber.from(slot)],
    ),
  );
}

function computeArrayDataSlot(baseSlot) {
  const slot = normalizeSlot(baseSlot);
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['uint256'],
      [ethers.BigNumber.from(slot)],
    ),
  );
}

function addSlot(baseSlot, increment) {
  return ethers.BigNumber.from(baseSlot).add(increment).toHexString();
}

function normalizeSlot(slot) {
  if (typeof slot === 'string' && slot.startsWith('0x')) {
    return ethers.BigNumber.from(slot).toHexString();
  }
  return ethers.BigNumber.from(slot).toHexString();
}
