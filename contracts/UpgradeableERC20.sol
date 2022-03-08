// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./erc20/ERC20.sol";
import "./access/AccessControlEnumerable.sol";

contract UpgradeableERC20 is ERC20, AccessControlEnumerable {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    bool public initialized;

    constructor(
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) ERC20(_name, _symbol, _decimals) {}

    function initialize(
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) public {
        require(!initialized, "initialized already");
        initialized = true;

        setName(_name);
        setSymbol(_symbol);
        setDecimals(_decimals);

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);

        _setupRole(MINTER_ROLE, msg.sender);
    }

    function mint(address _to, uint256 _amount) external {
        require(
            hasRole(MINTER_ROLE, msg.sender),
            "UpgradeableERC20: must have minter role to mint"
        );
        _mint(_to, _amount);
    }

    function burn(uint256 _amount) external {
        _burn(msg.sender, _amount);
    }
}
