require('@nomiclabs/hardhat-waffle');
require('@nomiclabs/hardhat-truffle5');
require('solidity-coverage');

module.exports = {
  solidity: {
    compilers: [
      {
        version: '0.8.2',
        settings: {
          optimizer: {
            enabled: true,
            runs: 1000,
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
  },
};
