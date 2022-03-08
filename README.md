# Conflux eSpace Bridge

The ERC20 bridge connects Conflux Core space and eSpace.

## Contract Ownership

|   Contract  | Type  | Authority | Assigned |
|  :----:  | :----:  | :---- | :---- | 
| ConfluxSideBeacon | Owner | Upgrade ConfluxSide | Timelock contract owned by a multi-sig contract |
| EvmSideBeacon  | Owner | Upgrade EvmSide | Timelock contract owned by a multi-sig contract |
| UpgradeableCRC20Beacon  | Owner | Upgrade mapped tokens on core space | Timelock contract owned by a multi-sig contract |
| UpgradeableERC20Beacon  | Owner | Upgrade mapped tokens on eSpace | Timelock contract owned by a multi-sig contract |
| ConfluxSide | Owner | DEFAULT_ADMIN_ROLE of all mapped tokens on core space | multi-sig contract
| EvmSide | Owner | DEFAULT_ADMIN_ROLE of all mapped tokens on eSpace | multi-sig contract
