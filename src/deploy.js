const { Conflux, format } = require('js-conflux-sdk');
const Web3 = require('web3');
const program = require('commander');
const BigNumber = require('bignumber.js');
const fs = require('fs');
const config = require('./config.js');

const w3 = new Web3(config.evmUrl);

const cfx = new Conflux({
  url: config.cfxUrl,
});

let addr0 = '0x0000000000000000000000000000000000000000';

let owner, admin;
let adminKey = config.adminKey;

let path = __dirname + '/../artifacts/contracts';

let CrossSpaceCall = require(`${path}/interfaces/ICrossSpaceCall.sol/ICrossSpaceCall.json`);
CrossSpaceCall.instance = cfx.Contract({
  bytecode: CrossSpaceCall.bytecode,
  abi: CrossSpaceCall.abi,
  address: '0x0888000000000000000000000000000000000006',
});

let UpgradeableCRC20 = JSON.parse(
  fs.readFileSync(`${path}/UpgradeableERC20.sol/UpgradeableERC20.json`),
);
UpgradeableCRC20.instance = cfx.Contract({
  bytecode: UpgradeableCRC20.bytecode,
  abi: UpgradeableCRC20.abi,
});

let ConfluxSide = require(`${path}/ConfluxSide.sol/ConfluxSide.json`);
ConfluxSide.instance = cfx.Contract({
  bytecode: ConfluxSide.bytecode,
  abi: ConfluxSide.abi,
});

let EvmSide = require(`${path}/EvmSide.sol/EvmSide.json`);
EvmSide.instance = new w3.eth.Contract(EvmSide.abi);

let UpgradeableERC20 = JSON.parse(
  fs.readFileSync(`${path}/UpgradeableERC20.sol/UpgradeableERC20.json`),
);
UpgradeableERC20.instance = new w3.eth.Contract(UpgradeableERC20.abi);

let ConfluxFaucetToken = JSON.parse(
  fs.readFileSync(`${path}/erc20/FaucetToken.sol/FaucetToken.json`),
);
ConfluxFaucetToken.instance = cfx.Contract({
  bytecode: ConfluxFaucetToken.bytecode,
  abi: ConfluxFaucetToken.abi,
});

let ConfluxMappedToken = JSON.parse(
  fs.readFileSync(`${path}/UpgradeableERC20.sol/UpgradeableERC20.json`),
);
ConfluxMappedToken.instance = cfx.Contract({
  bytecode: ConfluxMappedToken.bytecode,
  abi: ConfluxMappedToken.abi,
});

let EvmFaucetToken = JSON.parse(
  fs.readFileSync(`${path}/erc20/FaucetToken.sol/FaucetToken.json`),
);
EvmFaucetToken.instance = new w3.eth.Contract(EvmFaucetToken.abi);

let ERC20 = JSON.parse(fs.readFileSync(`${path}/erc20/ERC20.sol/ERC20.json`));

let EvmMappedToken = JSON.parse(
  fs.readFileSync(`${path}/UpgradeableERC20.sol/UpgradeableERC20.json`),
);
EvmMappedToken.instance = new w3.eth.Contract(EvmMappedToken.abi);

let beacon = require(`${path}/proxy/UpgradeableBeacon.sol/UpgradeableBeacon.json`);
let proxy = require(`${path}/proxy/BeaconProxy.sol/BeaconProxy.json`);

try {
  contractAddress = require(__dirname + '/../contractAddress.json');
} catch (e) {
  contractAddress = {};
}

function getAddress(x) {
  return format.address(format.hexAddress(x), cfx.networkId);
}

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

function printContractAddress() {
  fs.writeFileSync(
    __dirname + '/../contractAddress.json',
    JSON.stringify(contractAddress, null, '\t'),
  );
}

function printABI() {
  fs.writeFileSync(
    __dirname + '/../ConfluxSide.abi',
    JSON.stringify(ConfluxSide.abi, null, '\t'),
  );
  fs.writeFileSync(
    __dirname + '/../EvmSide.abi',
    JSON.stringify(EvmSide.abi, null, '\t'),
  );
  fs.writeFileSync(
    __dirname + '/../ERC20.abi',
    JSON.stringify(ERC20.abi, null, '\t'),
  );
}

async function ethTransact(data, to = undefined, nonce, value = 0) {
  let gasPrice = new BigNumber(await w3.eth.getGasPrice());
  gasPrice = gasPrice.multipliedBy(1.05).integerValue().toString(10);
  let txParams = {
    from: admin,
    to: to,
    nonce: w3.utils.toHex(nonce),
    value: w3.utils.toHex(value),
    gasPrice: gasPrice,
    data: data,
  };
  /*txParams.gas = new BigNumber(await w3.eth.estimateGas(txParams))
    .multipliedBy(1.5)
    .integerValue();
  if (txParams.gas.isLessThan(500000)) txParams.gas = new BigNumber(500000);
  txParams.gas = txParams.gas.toString(10);*/
  txParams.gas = '15000000';
  let encodedTransaction = await w3.eth.accounts.signTransaction(
    txParams,
    adminKey,
  );
  let rawTransaction = encodedTransaction.rawTransaction;
  let receipt = await w3.eth.sendSignedTransaction(rawTransaction);
  if (!receipt.status) throw new Error(`transaction failed`);
  return receipt;
}

async function waitForReceipt(hash) {
  for (;;) {
    let res = await cfx.getTransactionReceipt(hash);
    if (res != null) {
      if (
        res.stateRoot !==
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      ) {
        return res;
      }
    }
    await sleep(30000);
  }
}

async function waitAndVerify(hash, task) {
  let receipt = await waitForReceipt(hash);
  if (receipt.outcomeStatus !== 0) {
    console.log(`${task} failed!`);
  }
  return receipt;
}

async function waitNonce(target, acc) {
  let x;
  for (;;) {
    x = Number(await cfx.getNextNonce(acc));
    if (x < target) {
      await sleep(1000);
      continue;
    }
    break;
  }
  return x;
}

async function sendTransaction(tx_params) {
  let i = 0;
  let retry_round = 10;
  for (;;) {
    let j = 0;
    for (;;) {
      try {
        let res = await cfx.estimateGasAndCollateral(tx_params);
        let estimate_gas = Number(res.gasUsed);
        let estimate_storage = Number(res.storageCollateralized);
        //tx_params.gas = Math.ceil(estimate_gas);
        tx_params.gas = 10000000;
        tx_params.storageLimit = Math.ceil(estimate_storage * 1.3);
        tx_params.gasPrice = new BigNumber(await cfx.getGasPrice())
          .multipliedBy(1.05)
          .integerValue()
          .toString(10);
        break;
      } catch (e) {
        ++j;
        if (j % retry_round === 0) {
          console.log(`estimate retried ${j} times. received error: ${e}`);
        }
        await sleep(500);
      }
    }

    try {
      let tx_hash = await cfx.sendTransaction(tx_params);
      return tx_hash;
    } catch (e) {
      ++i;
      if (i % retry_round === 0) {
        console.log(`send retried ${i} times. received error: ${e}`);
      }
      await sleep(500);
    }
  }
}

async function cfxTransact(data, to, nonce, value = '0') {
  let txParams = {
    from: owner,
    to: to,
    nonce: nonce,
    data: data,
    value: value,
  };
  let hash = await sendTransaction(txParams);
  return waitAndVerify(hash);
}

async function crossCfx(to) {
  let nonce = Number(await cfx.getNextNonce(owner.address));
  let data = CrossSpaceCall.instance.transferEVM(
    Buffer.from(to.substring(2), 'hex'),
  ).data;
  await cfxTransact(
    data,
    CrossSpaceCall.instance.address,
    nonce,
    new BigNumber(1e19).toString(10),
  );
  console.log(
    `balance: ${new BigNumber(await w3.eth.getBalance(to))
      .dividedBy(1e18)
      .toString(10)}`,
  );
}

async function deployInProxyCfx(data, nonce, name, withProxy = true) {
  beacon.instance = cfx.Contract({
    bytecode: beacon.bytecode,
    abi: beacon.abi,
  });
  proxy.instance = cfx.Contract({
    bytecode: proxy.bytecode,
    abi: proxy.abi,
  });

  console.log(`deploy ${name} implementation..`);
  let receipt = await cfxTransact(data, undefined, nonce);
  contractAddress[`${name}Impl`] = getAddress(receipt.contractCreated);
  ++nonce;
  console.log(`impl: ${contractAddress[`${name}Impl`]}`);

  console.log(`deploy ${name} beacon..`);
  let beaconData = beacon.instance.constructor(contractAddress[`${name}Impl`])
    .data;
  receipt = await cfxTransact(beaconData, undefined, nonce);
  let beaconAddress = getAddress(receipt.contractCreated);
  contractAddress[`${name}Beacon`] = getAddress(receipt.contractCreated);
  ++nonce;
  console.log(`beacon: ${contractAddress[`${name}Beacon`]}`);

  if (withProxy) {
    console.log(`deploy ${name} proxy..`);
    let proxyData = proxy.instance.constructor(
      beaconAddress,
      Buffer.from('0x', 'hex'),
    ).data;
    receipt = await cfxTransact(proxyData, undefined, nonce);
    contractAddress[`${name}`] = getAddress(receipt.contractCreated);
    ++nonce;
    console.log(`proxy: ${contractAddress[`${name}`]}`);
  }
}

async function deployInProxyEVM(data, nonce, name, withProxy = true) {
  beacon.instance = new w3.eth.Contract(beacon.abi);
  proxy.instance = new w3.eth.Contract(proxy.abi);

  console.log(`deploy ${name} implementation..`);
  let receipt = await ethTransact(data, undefined, nonce);
  contractAddress[`${name}Impl`] = receipt.contractAddress.toLowerCase();
  ++nonce;

  console.log(`deploy ${name} beacon..`);
  let beaconData = beacon.instance
    .deploy({
      data: beacon.bytecode,
      arguments: [contractAddress[`${name}Impl`]],
    })
    .encodeABI();
  receipt = await ethTransact(beaconData, undefined, nonce);
  let beaconAddress = receipt.contractAddress.toLowerCase();
  contractAddress[`${name}Beacon`] = receipt.contractAddress.toLowerCase();
  ++nonce;

  if (withProxy) {
    console.log(`deploy ${name} proxy..`);
    let proxyData = proxy.instance
      .deploy({
        data: proxy.bytecode,
        arguments: [beaconAddress, '0x'],
      })
      .encodeABI();
    receipt = await ethTransact(proxyData, undefined, nonce);
    contractAddress[`${name}`] = receipt.contractAddress.toLowerCase();
    ++nonce;
  }

  /*proxy.instance.options.address = contractAddress[`${name}`];
  console.log(await proxy.instance.methods._beacon().call());*/
}

async function upgrade() {
  let cfxNonce = Number(await cfx.getNextNonce(owner.address));
  let evmNonce = await w3.eth.getTransactionCount(admin);

  let data, receipt;

  console.log(`deploy UpgradeableCRC20..`);
  data = UpgradeableCRC20.instance.constructor().data;
  receipt = await cfxTransact(data, undefined, cfxNonce);
  contractAddress[`UpgradeableCRC20Impl`] = getAddress(receipt.contractCreated);
  ++cfxNonce;

  beacon.instance = cfx.Contract({
    bytecode: beacon.bytecode,
    abi: beacon.abi,
  });
  console.log(`upgrade..`);
  data = beacon.instance.upgradeTo(contractAddress[`UpgradeableCRC20Impl`])
    .data;
  await cfxTransact(data, contractAddress.UpgradeableCRC20Beacon, cfxNonce);
  ++cfxNonce;

  console.log(`deploy UpgradeableERC20..`);
  data = UpgradeableERC20.instance
    .deploy({
      data: UpgradeableERC20.bytecode,
      arguments: [],
    })
    .encodeABI();
  receipt = await ethTransact(data, undefined, evmNonce);
  contractAddress[
    `UpgradeableERC20Impl`
  ] = receipt.contractAddress.toLowerCase();
  ++evmNonce;

  beacon.instance = new w3.eth.Contract(beacon.abi);
  console.log(`upgrade..`);
  data = beacon.instance.methods
    .upgradeTo(contractAddress[`UpgradeableERC20Impl`])
    .encodeABI();
  await ethTransact(data, contractAddress.UpgradeableERC20Beacon, evmNonce);
  ++evmNonce;
  console.log(`done..`);
  printContractAddress();
}

async function deploy() {
  let cfxNonce = Number(await cfx.getNextNonce(owner.address));
  let evmNonce = await w3.eth.getTransactionCount(admin);

  let data, receipt;

  console.log(`deploy UpgradeableCRC20..`);
  data = UpgradeableCRC20.instance.constructor().data;
  await deployInProxyCfx(data, cfxNonce, 'UpgradeableCRC20', false);
  cfxNonce += 2;

  console.log(`deploy UpgradeableERC20..`);
  data = UpgradeableERC20.instance
    .deploy({
      data: UpgradeableERC20.bytecode,
      arguments: [],
    })
    .encodeABI();
  await deployInProxyEVM(data, evmNonce, 'UpgradeableERC20', false);
  evmNonce += 2;

  console.log(`deploy Conflux Side..`);
  data = ConfluxSide.instance.constructor().data;
  await deployInProxyCfx(data, cfxNonce, 'ConfluxSide');
  cfxNonce += 3;

  console.log(`deploy Evm Side..`);
  data = EvmSide.instance
    .deploy({
      data: EvmSide.bytecode,
      arguments: [],
    })
    .encodeABI();
  await deployInProxyEVM(data, evmNonce, 'EvmSide');
  evmNonce += 3;

  console.log(`initialize cfx side..`);
  data = ConfluxSide.instance.initialize(
    contractAddress.EvmSide,
    contractAddress.UpgradeableCRC20Beacon,
  ).data;
  receipt = await cfxTransact(data, contractAddress.ConfluxSide, cfxNonce);
  ++cfxNonce;

  console.log(`initialize evm side..`);
  data = EvmSide.instance.methods
    .initialize(contractAddress.UpgradeableERC20Beacon)
    .encodeABI();
  receipt = await ethTransact(data, contractAddress.EvmSide, evmNonce);
  ++evmNonce;

  printContractAddress();
}

async function load() {
  ConfluxSide.instance.address = contractAddress.ConfluxSide;
  EvmSide.instance.options.address = contractAddress.EvmSide;
  /*
  ConfluxFaucetToken.instance.address = contractAddress.ConfluxFaucetToken;
  EvmFaucetToken.instance.options.address = contractAddress.EvmFaucetToken;
  let mappedEFT = await ConfluxSide.instance
    .mappedTokens(contractAddress.EvmFaucetToken)
    .call();
  if (mappedEFT !== addr0) {
    ConfluxMappedToken.instance.address = mappedEFT;
  }
  let mappedCFT = await EvmSide.instance.methods
    .mappedTokens(format.hexAddress(contractAddress.ConfluxFaucetToken))
    .call();
  if (mappedCFT !== addr0) {
    EvmMappedToken.instance.options.address = mappedCFT;
  }
  */
}

async function show() {
  await load();

  console.log(
    `EvmSide registered: ${await ConfluxSide.instance.evmSide().call()}`,
  );
  console.log(
    `ConfluxSide registered: ${await EvmSide.instance.methods
      .cfxSide()
      .call()}`,
  );
  console.log(
    `conflux $CFT admin balance: ${new BigNumber(
      await ConfluxFaucetToken.instance.balanceOf(owner.address).call(),
    )
      .dividedBy(1e18)
      .toString(10)}`,
  );
  console.log(
    `conflux $CFT ConfluxSide balance: ${new BigNumber(
      await ConfluxFaucetToken.instance
        .balanceOf(contractAddress.ConfluxSide)
        .call(),
    )
      .dividedBy(1e18)
      .toString(10)}`,
  );
  let mappedEFT = await ConfluxSide.instance
    .mappedTokens(contractAddress.EvmFaucetToken)
    .call();
  if (mappedEFT !== addr0) {
    console.log(
      `conflux admin mapped $EFT balance: ${new BigNumber(
        await ConfluxMappedToken.instance.balanceOf(owner.address).call(),
      )
        .dividedBy(1e18)
        .toString(10)}`,
    );
    console.log(
      `conflux side mapped $EFT balance: ${new BigNumber(
        await ConfluxMappedToken.instance
          .balanceOf(contractAddress.ConfluxSide)
          .call(),
      )
        .dividedBy(1e18)
        .toString(10)}`,
    );
  }
  console.log(
    `evm $EFT admin balance: ${new BigNumber(
      await EvmFaucetToken.instance.methods.balanceOf(admin).call(),
    )
      .dividedBy(1e18)
      .toString(10)}`,
  );
  console.log(
    `evm $EFT evmSide balance: ${new BigNumber(
      await EvmFaucetToken.instance.methods
        .balanceOf(contractAddress.EvmSide)
        .call(),
    )
      .dividedBy(1e18)
      .toString(10)}`,
  );
  let mappedCFT = await EvmSide.instance.methods
    .mappedTokens(format.hexAddress(contractAddress.ConfluxFaucetToken))
    .call();
  if (mappedCFT !== addr0) {
    console.log(
      `evm admin mapped $CFT balance: ${new BigNumber(
        await EvmMappedToken.instance.methods.balanceOf(admin).call(),
      )
        .dividedBy(1e18)
        .toString(10)}`,
    );
    console.log(
      `evm side mapped $CFT balance: ${new BigNumber(
        await EvmMappedToken.instance.methods
          .balanceOf(contractAddress.EvmSide)
          .call(),
      )
        .dividedBy(1e18)
        .toString(10)}`,
    );
  }
}

async function faucetToken() {
  let cfxNonce = Number(await cfx.getNextNonce(owner.address));
  let evmNonce = await w3.eth.getTransactionCount(admin);

  let data, receipt;

  console.log(`deploy Conflux Faucet Token..`);
  data = ConfluxFaucetToken.instance.constructor(
    'Conflux Faucet Token',
    'CFT',
    18,
  ).data;
  receipt = await cfxTransact(data, undefined, cfxNonce);
  contractAddress[`ConfluxFaucetToken`] = getAddress(receipt.contractCreated);
  ++cfxNonce;

  console.log(`mint CFT..`);
  data = ConfluxFaucetToken.instance.mint(
    owner.address,
    new BigNumber(1e20).toString(10),
  ).data;
  receipt = await cfxTransact(
    data,
    contractAddress.ConfluxFaucetToken,
    cfxNonce,
  );
  ++cfxNonce;

  console.log(`deploy Evm Faucet Token..`);
  data = EvmFaucetToken.instance
    .deploy({
      data: EvmFaucetToken.bytecode,
      arguments: ['Evm Faucet Token', 'EFT', 18],
    })
    .encodeABI();
  receipt = await ethTransact(data, undefined, evmNonce);
  contractAddress[`EvmFaucetToken`] = receipt.contractAddress.toLowerCase();
  ++evmNonce;

  console.log(`mint EFT..`);
  data = EvmFaucetToken.instance.methods
    .mint(admin, new BigNumber(1e20).toString(10))
    .encodeABI();
  receipt = await ethTransact(data, contractAddress.EvmFaucetToken, evmNonce);
  ++evmNonce;

  printContractAddress();
}

async function addevm() {
  EvmFaucetToken.instance.options.address =
    '0x54593e02c39aeff52b166bd036797d2b1478de8d';
  let cfxNonce = Number(await cfx.getNextNonce(owner.address));

  console.log(`create mapped token..`);
  data = ConfluxSide.instance.createMappedToken(
    EvmFaucetToken.instance.options.address,
  ).data;
  await cfxTransact(data, contractAddress.ConfluxSide, cfxNonce);
  ++cfxNonce;
}

async function grantMinterRole() {
  let tokens = [
    {
      symbol: 'USDT',
      address: '0xfe97E85d13ABD9c1c33384E796F10B73905637cE',
      cap: '50000000',
      minter: '0x639a647fbe20b6c8ac19e48e2de44ea792c62c5c',
    },
    {
      symbol: 'WBTC',
      address: '0x1F545487c62e5ACfEa45dcAdd9c627361d1616D8',
      cap: '1400',
      minter: '0x6ab6d61428fde76768d7b45d8bfeec19c6ef91a8',
    },
    {
      symbol: 'DAI',
      address: '0x74eaE367d018A5F29be559752e4B67d01cc6b151',
      cap: '50000000',
      minter: '0x80a16016cc4a2e6a2caca8a4a498b1699ff0f844',
    },
    {
      symbol: 'USDC',
      address: '0x6963EfED0aB40F6C3d7BdA44A05dcf1437C44372',
      cap: '50000000',
      minter: '0xb44a9b6905af7c801311e8f4e76932ee959c663c',
    },
    {
      symbol: 'ETH',
      address: '0xa47f43DE2f9623aCb395CA4905746496D2014d57',
      cap: '20000',
      minter: '0xe3f5a90f9cb311505cd691a46596599aa1a0ad7d',
    },
    {
      symbol: 'KCS',
      address: '0xf01042c4a5e69bd1d8ed69c1a4765ffb0cf7acce',
      cap: '3000000',
      minter: '0x2bf9b864cdc97b08b6d79ad4663e71b8ab65c45c',
    },
  ];
  let evmNonce = await w3.eth.getTransactionCount(admin);
  for (let i = 0; i < tokens.length; ++i) {
    UpgradeableERC20.instance.options.address = tokens[i].address;

    let data, receipt;
    console.log(`grant minter role of ${tokens[i].symbol}`);
    let MINTER_ROLE = await UpgradeableERC20.instance.methods
      .MINTER_ROLE()
      .call();
    data = UpgradeableERC20.instance.methods
      .grantRole(MINTER_ROLE, tokens[i].minter)
      .encodeABI();
    await ethTransact(data, tokens[i].address, evmNonce);
    ++evmNonce;

    console.log(`set mint cap..`);
    data = UpgradeableERC20.instance.methods
      .setMinterCap(
        tokens[i].minter,
        new BigNumber(tokens[i].cap).multipliedBy(1e18).toString(10),
      )
      .encodeABI();
    await ethTransact(data, tokens[i].address, evmNonce);
    ++evmNonce;
  }
  console.log(`done`);
}

async function add() {
  await load();

  let cfxNonce = Number(await cfx.getNextNonce(owner.address));
  let evmNonce = await w3.eth.getTransactionCount(admin);

  // testnet

  /*
  let tokens = [
    'cfxtest:ach727k1wt7kmj633hc1fcrrgbajmargkaxyycf6ee',
    'cfxtest:acepe88unk7fvs18436178up33hb4zkuf62a9dk1gv',
    'cfxtest:acceftennya582450e1g227dthfvp8zz1p370pvb6r',
    'cfxtest:achkx35n7vngfxgrm7akemk3ftzy47t61yk5nn270s',
  ];
  */

  // mainnet

  let tokens = [
    /*
    'cfx:acf2rcsh8payyxpg6xj7b0ztswwh81ute60tsw35j7', // cUSDT
    'cfx:acdrf821t59y12b4guyzckyuw2xf1gfpj2ba0x4sj6', // cETH
    'cfx:acbb225r9wc7a2kt1dz9gw0tuv5v1kgdjuh5akdh3t', // cBTC
    'cfx:aca13suyk7mbgxw9y3wbjn9vd136swu6s21tg67xmb', // cUSDC
    'cfx:acd3fhs4u0yzx7kpzrujhj15yg63st2z6athmtka95', // cDAI
    */
    'cfx:acg7z3y6x8pzem2v6pnyxuysn78pvgu3jjhzaatpy5', // WBTC
  ];

  let data, receipt;

  for (let i = 0; i < tokens.length; ++i) {
    console.log(`register ${tokens[i]} metadata to evm space`);
    data = ConfluxSide.instance.registerMetadata(tokens[i]).data;
    receipt = await cfxTransact(data, contractAddress.ConfluxSide, cfxNonce);
    ++cfxNonce;

    console.log(`create mapped ${tokens[i]} in EvmSide..`);
    data = EvmSide.instance.methods
      .createMappedToken(format.hexAddress(tokens[i]))
      .encodeABI();
    await ethTransact(data, contractAddress.EvmSide, evmNonce);
    ++evmNonce;
  }
}

async function list() {
  await load();
  let tokenList = {
    core_native_tokens: [],
    evm_native_tokens: [],
  };
  let res = (await EvmSide.instance.methods.getTokens(0).call()).result;
  for (let i = 0; i < res.length; ++i) {
    let tmp = {};
    tmp.native_address = getAddress(res[i]);
    tmp.mapped_address = await EvmSide.instance.methods
      .mappedTokens(res[i])
      .call();
    ConfluxFaucetToken.instance.address = tmp.native_address;
    tmp.core_space_name = await ConfluxFaucetToken.instance.name().call();
    tmp.core_space_symbol = await ConfluxFaucetToken.instance.symbol().call();
    EvmFaucetToken.instance.options.address = tmp.mapped_address;
    tmp.evm_space_name = await EvmFaucetToken.instance.methods.name().call();
    tmp.evm_space_symbol = await EvmFaucetToken.instance.methods
      .symbol()
      .call();
    tmp.decimals = await EvmFaucetToken.instance.methods.decimals().call();
    tmp.icon =
      'https://conflux-static.oss-cn-beijing.aliyuncs.com/icons/default.png';
    tokenList.core_native_tokens.push(tmp);
  }
  res = (await ConfluxSide.instance.getTokens(0).call()).result;
  for (let i = 0; i < res.length; ++i) {
    let tmp = {};
    tmp.native_address = format.hexAddress(res[i]);
    tmp.mapped_address = getAddress(
      await ConfluxSide.instance.mappedTokens(res[i]).call(),
    );
    ConfluxFaucetToken.instance.address = tmp.mapped_address;
    tmp.core_space_name = await ConfluxFaucetToken.instance.name().call();
    tmp.core_space_symbol = await ConfluxFaucetToken.instance.symbol().call();
    EvmFaucetToken.instance.options.address = tmp.native_address;
    tmp.evm_space_name = await EvmFaucetToken.instance.methods.name().call();
    tmp.evm_space_symbol = await EvmFaucetToken.instance.methods
      .symbol()
      .call();
    tmp.decimals = await EvmFaucetToken.instance.methods.decimals().call();
    tmp.icon =
      'https://conflux-static.oss-cn-beijing.aliyuncs.com/icons/default.png';
    tokenList.evm_native_tokens.push(tmp);
  }
  fs.writeFileSync(
    __dirname + '/../tmp.json',
    JSON.stringify(tokenList, null, '\t'),
  );
}

async function cross() {
  await load();

  let cfxNonce = Number(await cfx.getNextNonce(owner.address));
  let evmNonce = await w3.eth.getTransactionCount(admin);

  let data, receipt;

  console.log(`approve CFT to ConfluxSide..`);
  data = ConfluxFaucetToken.instance.approve(
    contractAddress.ConfluxSide,
    new BigNumber(1e18).toString(10),
  ).data;
  await cfxTransact(data, contractAddress.ConfluxFaucetToken, cfxNonce);
  ++cfxNonce;

  console.log(`register CFT metadata to evm space`);
  data = ConfluxSide.instance.registerMetadata(
    contractAddress.ConfluxFaucetToken,
  ).data;
  receipt = await cfxTransact(data, contractAddress.ConfluxSide, cfxNonce);
  ++cfxNonce;

  console.log(`create mapped CFT in EvmSide..`);
  data = EvmSide.instance.methods
    .createMappedToken(format.hexAddress(contractAddress.ConfluxFaucetToken))
    .encodeABI();
  await ethTransact(data, contractAddress.EvmSide, evmNonce);
  ++evmNonce;

  console.log(`cross CFT to evm space..`);
  data = ConfluxSide.instance.crossToEvm(
    contractAddress.ConfluxFaucetToken,
    admin,
    new BigNumber(1e18).toString(10),
  ).data;
  receipt = await cfxTransact(data, contractAddress.ConfluxSide, cfxNonce);
  ++cfxNonce;

  console.log(`done, current status:`);
  await show();
  console.log('');

  console.log(`approve EFT to EvmSide..`);
  data = EvmFaucetToken.instance.methods
    .approve(contractAddress.EvmSide, new BigNumber(1e18).toString(10))
    .encodeABI();
  await ethTransact(data, contractAddress.EvmFaucetToken, evmNonce);
  ++evmNonce;

  console.log(`lock EFT in EvmSide..`);
  data = EvmSide.instance.methods
    .lockToken(
      contractAddress.EvmFaucetToken,
      format.hexAddress(owner.address),
      new BigNumber(1e18).toString(10),
    )
    .encodeABI();
  await ethTransact(data, contractAddress.EvmSide, evmNonce);
  ++evmNonce;

  console.log(`cross EFT from EvmSide..`);
  data = ConfluxSide.instance.crossFromEvm(
    contractAddress.EvmFaucetToken,
    admin,
    new BigNumber(1e18).toString(10),
  ).data;
  await cfxTransact(data, contractAddress.ConfluxSide, cfxNonce);
  ++cfxNonce;

  console.log(`done. current status:`);
  await show();
}

async function withdraw() {
  await load();

  let cfxNonce = Number(await cfx.getNextNonce(owner.address));
  let evmNonce = await w3.eth.getTransactionCount(admin);

  let data, receipt;
  console.log(`approve mapped CFT to EvmSide..`);
  data = EvmMappedToken.instance.methods
    .approve(contractAddress.EvmSide, new BigNumber(1e18).toString(10))
    .encodeABI();
  await ethTransact(data, EvmMappedToken.instance.options.address, evmNonce);
  ++evmNonce;

  console.log(`lock mapped CFT in EvmSide..`);
  data = EvmSide.instance.methods
    .lockMappedToken(
      EvmMappedToken.instance.options.address,
      format.hexAddress(owner.address),
      new BigNumber(1e18).toString(10),
    )
    .encodeABI();
  await ethTransact(data, contractAddress.EvmSide, evmNonce);
  ++evmNonce;

  console.log(`withdraw from EvmSide..`);
  data = ConfluxSide.instance.withdrawFromEvm(
    contractAddress.ConfluxFaucetToken,
    admin,
    new BigNumber(1e18).toString(10),
  ).data;
  await cfxTransact(data, contractAddress.ConfluxSide, cfxNonce);
  ++cfxNonce;

  console.log(`done. current status:`);
  await show();
  console.log('');

  console.log(`approve mapped EFT to ConfluxSide..`);
  data = ConfluxMappedToken.instance.approve(
    contractAddress.ConfluxSide,
    new BigNumber(1e18).toString(10),
  ).data;
  await cfxTransact(data, ConfluxMappedToken.instance.address, cfxNonce);
  ++cfxNonce;

  console.log(`withdraw mapped EFT to EvmSide..`);
  data = ConfluxSide.instance.withdrawToEvm(
    contractAddress.EvmFaucetToken,
    admin,
    new BigNumber(1e18).toString(10),
  ).data;
  await cfxTransact(data, contractAddress.ConfluxSide, cfxNonce);
  ++cfxNonce;

  console.log(`done. current status:`);
  await show();
}

async function mint(cfxMintAddress = owner.address, ethMintAddress = admin) {
  await load();
  let cfxNonce = Number(await cfx.getNextNonce(owner.address));
  let evmNonce = await w3.eth.getTransactionCount(admin);

  console.log(`mint CFT..`);
  data = ConfluxFaucetToken.instance.mint(
    cfxMintAddress,
    new BigNumber(1e20).toString(10),
  ).data;
  receipt = await cfxTransact(
    data,
    contractAddress.ConfluxFaucetToken,
    cfxNonce,
  );
  ++cfxNonce;

  console.log(`mint EFT..`);
  data = EvmFaucetToken.instance.methods
    .mint(ethMintAddress, new BigNumber(1e20).toString(10))
    .encodeABI();
  receipt = await ethTransact(data, contractAddress.EvmFaucetToken, evmNonce);
  ++evmNonce;
}

async function test() {
  let cfxNonce = Number(await cfx.getNextNonce(owner.address));
  let evmNonce = await w3.eth.getTransactionCount(admin);

  let cfxTokens = [
    'cfxtest:acby2hxk08tfdu42pe1hn7x7vg7ywruywy1ga2hehw',
    'cfxtest:ach8z0z6ymhseumnv9t0b6y6zws2p607kyycpz23uv',
  ];

  let evmTokens = [
    '0xc229b45761C0F960A8d6cD4f770E7065528d150A',
    '0x2eeb7e2B0248AC9B3bFF5F3A1aA3Ad06eF7e675D',
    '0x26AEe1DEe904c9D20bF6828950633174223D5216',
    '0xd6A432c616cE42Aa15E32aC5c0998112Accae76A',
  ];

  UpgradeableERC20.instance.options.address = evmTokens[0];
  let MINTER_ROLE = await UpgradeableERC20.instance.methods
    .MINTER_ROLE()
    .call();
  let maxInt =
    '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

  let data;
  for (let i = 0; i < cfxTokens.length; ++i) {
    UpgradeableCRC20.instance.address = cfxTokens[i];
    let cnt = await UpgradeableCRC20.instance
      .getRoleMemberCount(Buffer.from(MINTER_ROLE.substring(2), 'hex'))
      .call();
    for (let j = 0; j < cnt; ++j) {
      let member = await UpgradeableCRC20.instance
        .getRoleMember(Buffer.from(MINTER_ROLE.substring(2), 'hex'), j)
        .call();
      let cap = new BigNumber(1e18).multipliedBy(1e7).toString(10);
      if (j === 0) cap = maxInt;
      console.log(
        `setting ${cfxTokens[i]} token ${member} mint cap to ${cap}..`,
      );
      data = UpgradeableCRC20.instance.setMinterCap(member, cap).data;
      await cfxTransact(data, cfxTokens[i], cfxNonce);
      ++cfxNonce;
    }
  }

  for (let i = 0; i < evmTokens.length; ++i) {
    UpgradeableERC20.instance.options.address = evmTokens[i];
    let cnt = await UpgradeableERC20.instance.methods
      .getRoleMemberCount(MINTER_ROLE)
      .call();
    for (let j = 0; j < cnt; ++j) {
      let member = await UpgradeableERC20.instance.methods
        .getRoleMember(MINTER_ROLE, j)
        .call();
      let cap = new BigNumber(1e18).multipliedBy(1e7).toString(10);
      if (j === 0) cap = maxInt;
      console.log(
        `setting ${evmTokens[i]} token ${member} mint cap to ${cap}..`,
      );
      data = UpgradeableERC20.instance.methods
        .setMinterCap(member, cap)
        .encodeABI();
      await ethTransact(data, evmTokens[i], evmNonce);
      ++evmNonce;
    }
  }

  console.log('done.');
}

async function token() {
  let nonce = await w3.eth.getTransactionCount(admin);
  proxy.instance = new w3.eth.Contract(proxy.abi);

  let name = 'KuCoin Token';
  let symbol = 'KCS';

  let beaconAddress = contractAddress.UpgradeableERC20Beacon;

  console.log(`deploy ${name} proxy..`);
  let data = proxy.instance
    .deploy({
      data: proxy.bytecode,
      arguments: [beaconAddress, '0x'],
    })
    .encodeABI();
  receipt = await ethTransact(data, undefined, nonce);
  contractAddress[`${name}`] = receipt.contractAddress.toLowerCase();
  ++nonce;

  console.log(`initialize..`);
  data = UpgradeableERC20.instance.methods
    .initialize(name, symbol, 18, admin)
    .encodeABI();
  await ethTransact(data, contractAddress[`${name}`], nonce);
  ++nonce;

  printContractAddress();
}

async function transferOwnershipCfx(name, to, nonce) {
  console.log(`transfer ownership of ${name} to ${to}..`);
  data = ConfluxSide.instance.transferOwnership(to).data;
  await cfxTransact(data, contractAddress[name], nonce);
}

async function transferOwnershipEth(name, to, nonce) {
  console.log(`transfer ownership of ${name} to ${to}..`);
  data = EvmSide.instance.methods.transferOwnership(to).encodeABI();
  await ethTransact(data, contractAddress[name], nonce);
}

async function ownership() {
  await load();
  let cfxNonce = Number(await cfx.getNextNonce(owner.address));
  let evmNonce = await w3.eth.getTransactionCount(admin);

  let data, receipt, res;
  let DEFAULT_ADMIN_ROLE =
    '0x0000000000000000000000000000000000000000000000000000000000000000';

  await transferOwnershipCfx(
    `ConfluxSide`,
    contractAddress.ConfluxSafe,
    cfxNonce,
  );
  ++cfxNonce;
  await transferOwnershipCfx(
    `ConfluxSideBeacon`,
    contractAddress.ConfluxTimelock,
    cfxNonce,
  );
  ++cfxNonce;
  await transferOwnershipCfx(
    `UpgradeableCRC20Beacon`,
    contractAddress.ConfluxTimelock,
    cfxNonce,
  );
  ++cfxNonce;

  await transferOwnershipEth(`EvmSide`, contractAddress.EvmSafe, evmNonce);
  ++evmNonce;
  await transferOwnershipEth(
    `EvmSideBeacon`,
    contractAddress.EvmTimelock,
    evmNonce,
  );
  ++evmNonce;
  await transferOwnershipEth(
    `UpgradeableERC20Beacon`,
    contractAddress.EvmTimelock,
    evmNonce,
  );
  ++evmNonce;

  res = (await EvmSide.instance.methods.getTokens(0).call()).result;
  let DEFAULT_ADMIN_ROLE =
    '0x0000000000000000000000000000000000000000000000000000000000000000';
  for (let i = 0; i < res.length; ++i) {
    let mapped_address = await EvmSide.instance.methods
      .mappedTokens(res[i])
      .call();
    EvmFaucetToken.instance.options.address = mapped_address;
    let symbol = await EvmFaucetToken.instance.methods.symbol().call();

    console.log(`grant DEFAULT_ADMIN_ROLE of ${symbol} to EvmSafe..`);
    let data = UpgradeableERC20.instance.methods
      .grantRole(DEFAULT_ADMIN_ROLE, contractAddress.EvmSafe)
      .encodeABI();
    await ethTransact(data, mapped_address, evmNonce);
    ++evmNonce;

    console.log(`revoke DEFAULT_ADMIN_ROLE of ${symbol}..`);
    data = UpgradeableERC20.instance.methods
      .renounceRole(DEFAULT_ADMIN_ROLE, admin)
      .encodeABI();
    await ethTransact(data, mapped_address, evmNonce);
    ++evmNonce;
  }

  res = (await ConfluxSide.instance.getTokens(0).call()).result;
  for (let i = 0; i < res.length; ++i) {
    let mapped_address = await ConfluxSide.instance.mappedTokens(res[i]).call();
    ConfluxFaucetToken.instance.address = mapped_address;
    let symbol = await ConfluxFaucetToken.instance.symbol().call();

    console.log(`grant DEFAULT_ADMIN_ROLE of ${symbol} to ConfluxSafe..`);
    let data = UpgradeableCRC20.instance.grantRole(
      Buffer.from(DEFAULT_ADMIN_ROLE.substring(2), 'hex'),
      contractAddress.ConfluxSafe,
    ).data;
    await cfxTransact(data, mapped_address, cfxNonce);
    ++cfxNonce;

    console.log(`revoke DEFAULT_ADMIN_ROLE of ${symbol}..`);
    data = UpgradeableCRC20.instance.renounceRole(
      Buffer.from(DEFAULT_ADMIN_ROLE.substring(2), 'hex'),
      owner.address,
    ).data;
    await cfxTransact(data, mapped_address, cfxNonce);
    ++cfxNonce;
  }
  console.log(`done`);
}

async function run() {
  await cfx.updateNetworkId();
  owner = cfx.wallet.addPrivateKey(config.adminKey);
  admin = w3.eth.accounts.privateKeyToAccount(config.adminKey).address;

  program
    .option('--crosscfx', 'cross cfx')
    .option('--deploy', 'deploy contracts')
    .option('--faucet', 'faucet tokens')
    .option('--show', 'show')
    .option('--cross', 'cross CFT and EFT to other side')
    .option('--withdraw', 'withdraw mapped CFT and EFT to original side')
    .option('--add', 'add tokens')
    .option('--addevm', 'add espace tokens')
    .option('--list', 'print token list')
    .option('--test', 'test')
    .option('--mint', 'mint')
    .option('--grantMinter', 'grant minter role')
    .option('--upgrade', 'upgrade')
    .option('--token', 'deploy token')
    .option('--ownership', 'change ownership')
    .parse(process.argv);

  if (program.crosscfx) {
    crossCfx(admin);
  } else if (program.deploy) {
    deploy();
  } else if (program.show) {
    show();
  } else if (program.faucet) {
    faucetToken();
  } else if (program.cross) {
    cross();
  } else if (program.withdraw) {
    withdraw();
  } else if (program.add) {
    add();
  } else if (program.list) {
    list();
  } else if (program.test) {
    test();
  } else if (program.mint) {
    mint(
      'cfxtest:aajbjw3xb9u581j4hn0n15ys7t6f61kr1628kf304y',
      '0xC3F7727723B3928a25ea354a124D71EA5180b71f',
    );
  } else if (program.addevm) {
    addevm();
  } else if (program.grantMinter) {
    grantMinterRole();
  } else if (program.upgrade) {
    upgrade();
  } else if (program.token) {
    token();
  } else if (program.ownership) {
    ownership();
  }
  /*await crossCfx('0xF8298fCFA36981DD5aE401fD1d880B16464C5860');
  await crossCfx('0x34e676cC66DB8Ea20C2a42a1939b5bcf303CED72');
  await crossCfx('0x18e9316A928D7EA29CCB0E2c5927E6690DBc73fe');*/
  //await crossCfx('0x29d0068A37cb899737912CD258bc556003d7D462');
  //await crossCfx('0x3b870994548D48db260F1aBA2D1f80F1F266f17F');
  //await crossCfx('0xe8dc5b188c81c85751d624680ef81493bb58bb2c');
}

run();
//printABI();
