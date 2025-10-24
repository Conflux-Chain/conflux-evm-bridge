const { ethers } = require('hardhat');
const { upgrades } = require('hardhat');
require('dotenv').config();

module.exports = async ({ getNamedAccounts, deployments, network }) => {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();

  if (!process.env.PRIVATE_KEY || process.env.PRIVATE_KEY === 'a'.repeat(64)) {
    throw new Error('PRIVATE_KEY not set or invalid in environment variables');
  }

  // Only run on Conflux networks
  if (network.name !== 'confluxMainnet' && network.name !== 'confluxTestnet') {
    log('Skipping upgrade: not on Conflux network');
    return;
  }

  // Deploy the new implementation using hardhat-deploy
  const erc20Impl = await deploy('UpgradeableERC20', {
    from: deployer,
    args: [],
    log: true,
    unsafeAllow: ['constructor'],
  });

  const implementationAddress = erc20Impl.address;

  log(`Deployed new implementation at ${implementationAddress}`);

  try {
    await hre.run('verify:verify', { address: implementationAddress, constructorArguments: [] });
    log(`New implementation contract verified on ConfluxScan (${network.name})`);
  } catch (error) {
    log('Verification failed:', error.message);
  }

  // Get the beacon contract
  const beaconAddress = process.env.BEACON_ADDRESS;
  if (!beaconAddress) {
    throw new Error('BEACON_ADDRESS not set in .env file');
  }

  // Check if beacon contract exists
  const beaconCode = await ethers.provider.getCode(beaconAddress);
  if (beaconCode === '0x') {
    throw new Error(`Beacon contract does not exist at ${beaconAddress}`);
  }

  const beacon = await ethers.getContractAt('UpgradeableBeacon', beaconAddress);

  // Upgrade the beacon to point to the new implementation
  const tx = await beacon.upgradeTo(implementationAddress);
  const receipt = await tx.wait();

  if (receipt.status !== 1) {
    log(receipt);
    throw new Error('Upgrade transaction failed');
  }

  log(`Upgraded beacon ${beaconAddress} to new implementation ${implementationAddress}`);

  // Verify the upgrade was successful
  const currentImplementation = await beacon.implementation();
  if (currentImplementation !== implementationAddress) {
    throw new Error(`Upgrade verification failed: expected ${implementationAddress}, got ${currentImplementation}`);
  }

  log('Upgrade verified successfully');
};

module.exports.tags = ['upgrade-erc20'];