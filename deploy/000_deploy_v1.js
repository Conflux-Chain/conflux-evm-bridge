const { ethers } = require('hardhat');
const { upgrades } = require('hardhat');
require('dotenv').config();

module.exports = async ({ getNamedAccounts, deployments, network }) => {
  const { log } = deployments;
  const { deployer } = await getNamedAccounts();

  const signer = await ethers.getSigner(deployer);

  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY not set or invalid in environment variables');
  }

  // Only run on Conflux networks
  if (network.name !== 'confluxTestnet') {
    log('Skipping deployment: not on Conflux testnet');
    return;
  }

  // Deploy UpgradeableERC20V1 with beacon proxy
  log('Deploying UpgradeableERC20V1 with beacon proxy...');

  const UpgradeableERC20V1 = await ethers.getContractFactory('UpgradeableERC20V1', signer);
  const beacon = await upgrades.deployBeacon(UpgradeableERC20V1);
  await beacon.deployed();

  log(`Beacon deployed at ${beacon.address}`);

  // Deploy a proxy instance
  const proxy = await upgrades.deployBeaconProxy(
    beacon,
    UpgradeableERC20V1,
    ['Test Token', 'TTK', 18, deployer],
    { initializer: 'initialize' }
  );
  await proxy.deployed();

  log(`Proxy deployed at ${proxy.address}`);

  // Save beacon address to .env for upgrade script
  const fs = require('fs');
  const envPath = '.env';
  let envContent = fs.readFileSync(envPath, 'utf8');
  const beaconLine = `BEACON_ADDRESS=${beacon.address}`;
  if (envContent.includes('BEACON_ADDRESS=')) {
    envContent = envContent.replace(/BEACON_ADDRESS=.*/, beaconLine);
  } else {
    envContent += `\n${beaconLine}`;
  }
  fs.writeFileSync(envPath, envContent);

  log(`Updated .env with BEACON_ADDRESS=${beacon.address}`);
};

module.exports.tags = ['deploy-erc20-v1'];