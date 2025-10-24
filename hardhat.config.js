require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-truffle5');
require('solidity-coverage');
require('@openzeppelin/hardhat-upgrades');
require('hardhat-deploy');
require('@nomiclabs/hardhat-etherscan');
require('dotenv').config();

module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.8.2',
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          outputSelection: {
            '*': {
              '*': [
                'abi',
                'evm.bytecode',
                'evm.deployedBytecode',
                'metadata',
                'storageLayout',
              ],
            },
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      accounts: { accountsBalance: '100000000000000000000000000' },
    },
    confluxMainnet: {
      url: 'https://evm.confluxrpc.com',
      chainId: 1030,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY.replace(/^0x/, '')] : [],
    },
    confluxTestnet: {
      url: 'https://evmtestnet.confluxrpc.com',
      chainId: 71,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY.replace(/^0x/, '')] : [],
    },
  },
  etherscan: {
    apiKey: {
      confluxMainnet: process.env.CONFLUXSCAN_API_KEY || 'dummy',
      confluxTestnet: process.env.CONFLUXSCAN_API_KEY || 'dummy',
    },
    customChains: [
      {
        network: 'confluxMainnet',
        chainId: 1030,
        urls: {
          apiURL: 'https://evmapi.confluxscan.org/api/',
          browserURL: 'https://evm.confluxscan.org/',
        },
      },
      {
        network: 'confluxTestnet',
        chainId: 71,
        urls: {
          apiURL: 'https://evmapi-testnet.confluxscan.org/api/',
          browserURL: 'https://evmtestnet.confluxscan.org/',
        },
      },
    ],
  },
  namedAccounts: {
    deployer: {
      default: 0, // First account for localhost/hardhat
      confluxTestnet: process.env.PRIVATE_KEY ? "privateKey://" + process.env.PRIVATE_KEY : 0,
      confluxMainnet: process.env.PRIVATE_KEY ? "privateKey://" + process.env.PRIVATE_KEY : 0,
    },
  },
};