const { expect } = require('chai');

describe('UpgradeableERC20', function () {
  it('works', async () => {
    // create a copy of old UpgradeableERC20 contract, rename it to UpgradeableERC20V1
    const erc20V1 = await ethers.getContractFactory('UpgradeableERC20V1');
    const erc20 = await ethers.getContractFactory('UpgradeableERC20');

    const beacon = await upgrades.deployBeacon(erc20V1, {
      unsafeAllow: ['constructor'],
    });
    const instance = await upgrades.deployBeaconProxy(beacon, erc20V1, [
      'test token',
      'test',
      18,
      '0x9201000000000000000000000000000000001029',
    ]);

    await upgrades.upgradeBeacon(beacon, erc20, {
      unsafeAllow: ['constructor'],
    });
    const upgraded = erc20.attach(instance.address);

    const name = await upgraded.name();
    expect(name).to.equal('test token');

    const minterRole = await upgraded.MINTER_ROLE();
    const adminRole = await upgraded.DEFAULT_ADMIN_ROLE();
    const minterCount = await upgraded.getRoleMemberCount(minterRole);
    expect(minterCount).to.equal(1);

    const minter = await upgraded.getRoleMember(adminRole, 0);
    expect(minter).to.equal('0x9201000000000000000000000000000000001029');
  });
});
