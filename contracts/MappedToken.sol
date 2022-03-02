// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./erc20/ERC20.sol";

contract MappedToken is ERC20 {
    address public admin;
    address public sourceToken;

    constructor(
        address _admin,
        address _sourceToken,
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) ERC20(_name, _symbol, _decimals) {
        admin = _admin;
        sourceToken = _sourceToken;
    }

    function mint(address _to, uint256 _amount) external {
        require(msg.sender == admin, "MappedToken: not admin");
        _mint(_to, _amount);
    }

    function burn(address _account, uint256 _amount) external {
        require(msg.sender == admin, "MappedToken: not admin");
        _burn(_account, _amount);
    }
}
