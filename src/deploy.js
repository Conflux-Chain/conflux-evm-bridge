const { Conflux, format } = require('js-conflux-sdk');
const Web3 = require('web3');
const program = require('commander');
const BigNumber = require('bignumber.js');
const fs = require('fs');
const config = require('./config.js');

const w3 = new Web3(config.evmUrl);

const cfx = new Conflux({
  url: config.cfxUrl,
  networkId: config.networkId,
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

let ConfluxSide = require(`${path}/ConfluxSide.sol/ConfluxSide.json`);
ConfluxSide.instance = cfx.Contract({
  bytecode: ConfluxSide.bytecode,
  abi: ConfluxSide.abi,
});

let EvmSide = require(`${path}/EvmSide.sol/EvmSide.json`);
EvmSide.instance = new w3.eth.Contract(EvmSide.abi);

let ConfluxFaucetToken = JSON.parse(
  fs.readFileSync(`${path}/erc20/FaucetToken.sol/FaucetToken.json`),
);
ConfluxFaucetToken.instance = cfx.Contract({
  bytecode: ConfluxFaucetToken.bytecode,
  abi: ConfluxFaucetToken.abi,
});

let ConfluxMappedToken = JSON.parse(
  fs.readFileSync(`${path}/MappedToken.sol/MappedToken.json`),
);
ConfluxMappedToken.instance = cfx.Contract({
  bytecode: ConfluxMappedToken.bytecode,
  abi: ConfluxMappedToken.abi,
});

let EvmFaucetToken = JSON.parse(
  fs.readFileSync(`${path}/erc20/FaucetToken.sol/FaucetToken.json`),
);
EvmFaucetToken.instance = new w3.eth.Contract(EvmFaucetToken.abi);

let EvmMappedToken = JSON.parse(
  fs.readFileSync(`${path}/MappedToken.sol/MappedToken.json`),
);
EvmMappedToken.instance = new w3.eth.Contract(EvmMappedToken.abi);

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
  txParams.gas = new BigNumber(await w3.eth.estimateGas(txParams))
    .multipliedBy(1.5)
    .integerValue();
  if (txParams.gas.isLessThan(500000)) txParams.gas = new BigNumber(500000);
  txParams.gas = txParams.gas.toString(10);
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
        tx_params.gas = Math.ceil(estimate_gas);
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
        console.log(tx_params);
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

async function crossCfx() {
  let nonce = Number(await cfx.getNextNonce(owner.address));
  let data = CrossSpaceCall.instance.transferEVM(
    Buffer.from(admin.substring(2), 'hex'),
  ).data;
  await cfxTransact(
    data,
    CrossSpaceCall.instance.address,
    nonce,
    new BigNumber(1e19).toString(10),
  );
  console.log(
    `balance: ${new BigNumber(await w3.eth.getBalance(admin))
      .dividedBy(1e18)
      .toString(10)}`,
  );
}

async function deploy() {
  let cfxNonce = Number(await cfx.getNextNonce(owner.address));
  let evmNonce = await w3.eth.getTransactionCount(admin);

  let data, receipt;
  console.log(`deploy Conflux Side..`);
  data = ConfluxSide.instance.constructor().data;
  receipt = await cfxTransact(data, undefined, cfxNonce);
  contractAddress[`ConfluxSide`] = getAddress(receipt.contractCreated);
  ++cfxNonce;

  console.log(`deploy Evm Side..`);
  data = EvmSide.instance
    .deploy({
      data: EvmSide.bytecode,
      arguments: [],
    })
    .encodeABI();
  receipt = await ethTransact(data, undefined, evmNonce);
  contractAddress[`EvmSide`] = receipt.contractAddress.toLowerCase();
  ++evmNonce;

  console.log(`register both side..`);
  data = ConfluxSide.instance.setEvmSide(contractAddress.EvmSide).data;
  receipt = await cfxTransact(data, contractAddress.ConfluxSide, cfxNonce);
  ++cfxNonce;

  printContractAddress();
}

async function load() {
  ConfluxSide.instance.address = contractAddress.ConfluxSide;
  EvmSide.instance.options.address = contractAddress.EvmSide;
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
    .parse(process.argv);

  if (program.crosscfx) {
    crossCfx();
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
  }
}

run();
