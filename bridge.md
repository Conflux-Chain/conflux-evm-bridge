# Conflux Evm Bridge

## Test Environment Contract Address(public testnet)

[public testnet address](contractAddressTestnet.json)

## Contract Overview

There are two core bridge contracts, **ConfluxSide** and **EvmSide**,deployed at Conflux core space and Evm space respectively. Besides, there are two token contract **ConfluxFaucetToken** and **EvmFaucetToken** on core space and evm space respectively, they are used for test.

For a native token at core space, anyone is able to create a **mapped token** at EVM space by interacting with two bridge contracts. After that, a sender can lock the native token at **ConfluxSide** contract, and the designated receiver is able to claim the same amount of mapped token at EVM space from **EVMSide**. People can also burn the mapped token at EVM space and withdraw their native token at core space.

In the same way, for a native token at evm space, anyone is able to create a **mapped token** at core space, then people can cross the native token to core space.

The following sections illustrate the contract functions relevant to cross space. The creation of mapped token will be left out.

## ConfluxSide

```solidity
function crossToEvm(
    address _token,
    address _evmAccount,
    uint256 _amount
);
```
Parameters:

*_token*: core space native token address

*_evmAccount*: evm space address, receiver of the mapped token

*_amount*: amount of native token to cross, must be larger than zero

This function will take *_amount* native token *_token* from sender and lock in ConfluxSide contract, then mint *_amount* mapped token at evm space to *_evmAccount*.

```solidity
function withdrawFromEvm(
    address _token,
    address _evmAccount,
    uint256 _amount
)
```
Parameters:

*_token*: core space native token address

*_evmAccount*: evm space address, the account who locked mapped token in EVMSide

*_amount*: amount of native token to withdraw, must be larger than zero

This function will withdraw *_amount* native token from ConfluxSide contract and burn same amount of mapped token locked by *_evmAccount* in EVMSide.

```solidity
function crossFromEvm(
    address _evmToken,
    address _evmAccount,
    uint256 _amount
)
```

Parameters:

*_evmToken*: evm space native token address

*_evmAccount*: evm space address, the account who locked native token in EVMSide

*_amount*: amount of mapped token at core space to mint, must be larger than zero

This function will mint *_amount* mapped token to sender and take *_amount* native token *_evmToken* locked by *_evmAccount* in EVMSide.

```solidity
function withdrawToEvm(
    address _evmToken,
    address _evmAccount,
    uint256 _amount
)
```

Parameters:

*_evmToken*: evm space native token address

*_evmAccount*: evm space address, receiver of the native token

*_amount*: amount of mapped token at core space to burn, must be larger than zero

This function burn *_amount* of mapped token, and send *_amount* of native token *_evmToken* to *_evmAccount* at evm space.

```solidity
mapping(address => address) public mappedTokens;
```
mapping of evm native token address to mapped token address at core space.

this mapping can used to determine if an address is an evm native token that is able to cross space (check the value is zero address or not).

```solidity
mapping(address => address) public sourceTokens;
```
mapping of mapped token at core space to evm native token address. the reverse mappinig of *mappedtokens*.

this mapping can used to determine if an address is a mapped token of evm native token at core space (check the value is zero address or not).

## EVMSide

```solidity
function lockMappedToken(
    address _mappedToken,
    address _cfxAccount,
    uint256 _amount
)
```

Parameters:

*_mappedToken*: address of mapped token of a native token from core space

*_cfxAccount*: core space address, the receiver of native token

*_amount*: amount of mapped token to lock

This function will lock *_amount* mapped token *_mappedToken* in EVMSide for core space account *_cfxAccount*. After this, *_cfxAccount* is able to withdraw its native token from ConfluxSide through *withdrawFromEvm* function.

```solidity
function lockToken(
    address _token,
    address _cfxAccount,
    uint256 _amount
)
```

Parameters:

*_token*: address of evm native token

*_cfxAccount*: core space address, the receiver of mapped token

*_amount*: amount of native token to lock

This function will lock *_amount* native token *_token* in EVMSide for core space account *_cfxAccount*. After this, *_cfxAccount* is able to mint himself mapped token from ConfluxSide through *crossFromEvm* function.

```solidity
mapping(address => mapping(address => mapping(address => uint256))) public lockedMappedToken;
```

mapping: 

address of mapped token => evm space address, the locker => core space address, the receiver => lock amount

Given the mapped token of a core space native token, the evm account who locked in EVMSide, the core space account who is able to claim, get the current locked amount in EVMSide, which is equal to the claimable amount of native token at core space.

```solidity
mapping(address => mapping(address => mapping(address => uint256))) public lockedToken;
```

mapping: 

address of evm native token => evm space address, the locker => core space address, the receiver => lock amount

Given the evm native token, the evm account who locked in EVMSide, the core space account who is able to claim, get the current locked amount in EVMSide, which is equal to the mintable amount of mapped token at core space.

```solidity
mapping(address => address) public mappedTokens;
```
mapping of core space native token address to mapped token address at evm space.

this mapping can used to determine if an address is an core space native token that is able to cross space (check the value is zero address or not).

```solidity
mapping(address => address) public sourceTokens;
```
mapping of mapped token at evm space to core space native token address. the reverse mappinig of *mappedtokens*.

this mapping can used to determine if an address is a mapped token of a core space native token at evm space (check the value is zero address or not).

## Core Native Token Example

Assume we have:

_token: core space native CRC20 token address

_cfxAccount: core space address

_evmAccount: evm space address

_mappedToken: mapped token address of core space native CRC20 *_token* at EVM space

Steps of cross to EVM space:

(1) approve *ConfluxSide* to use *_token* of *_cfxAccount*;

(2) call *crossToEvm(_token, _evmAccount, 10)* of *ConfluxSide*

Now we have 10 *_token* locked in *ConfluxSide* and *_evmAccount* received 10 *_mappedToken*.

Steps of withdraw from EVM space:

(1) approve *EVMSide* to use *_mappedToken* of *_evmAccount*;

(2) call *lockMappedToken(_mappedToken, _cfxAccount, 10)* of *EVMSide*;

(2.5) we can see *lockedMappedToken[_mappedToken][_evmAccount][_cfxAccount] = 10* in EVMSide;

(3) call *withdrawFromEvm(_token, _evmAccount, 10)* of *ConfluxSide*;

(3.5) now *lockedMappedToken[_mappedToken][_evmAccount][_cfxAccount] = 0* in EVMSide.

## EVM Native Token Example

Assume we have:

_token: evm space native ERC20 token address

_cfxAccount: core space address

_evmAccount: evm space address

_mappedToken: mapped token address of evm space native ERC20 *_token* at core space

Steps of cross to core space:

(1) approve *EVMSide* to use *_token* of *_evmAccount*;

(2) call *lockToken(_token, _cfxAccount, 10)* of *EVMSide*;

(2.5) we can see *lockedToken[_token][_evmAccount][_cfxAccount] = 10* in EVMSide;

(3) call *crossFromEvm(_token, _evmAccount, 10)* of *ConfluxSide*;

(3.5) now *lockedToken[_token][_evmAccount][_cfxAccount] = 0* in EVMSide.

Now *_cfxAccount* recieved 10 mapped token and *EVMSide* holds 10 native token.

Steps of withdraw from core space:

(1) approve *ConfluxSide* to use *_mappedToken* of *_cfxAccount*;

(2) call *withdrawToEvm(_token, _evmAccount, 10)*.

## Liquidity Provider

Liquidity providers can provide liquidity for tokens whose cross chain type is LIQUIDITY_POOL in two steps.

(1) call ```approve``` of the token, set the spender to the bridge contract, i.e. ```EvmSide``` on eSpace or ```ConfluxSide``` on core space. 

(2) call ```addLiquidity``` of the bridge contract: 
```
addLiquidity(address _token, uint256 _amount)
```

This function will transfer ```_amount``` token from sender address and mint ```_amount``` pegged token to sender as LP token.

Further, liquidity providers can call ```removeLiquidity``` of the bridge contract to redeem their token:
```
removeLiquidity(address _token, uint256 _amount)
```
This function will burn ```_amount``` pegged token from the sender's address and transfer ```_amount``` token to sender.

The contract address for [testnet](contractAddressTestnet.json) and [mainnet](contractAddressMainnet.json) can be found at root folder.