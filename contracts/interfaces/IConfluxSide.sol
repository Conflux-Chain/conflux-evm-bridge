// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./IERC20.sol";

abstract contract IConfluxSide {
    event CrossToEvm(
        address indexed token,
        address indexed evmAccount,
        uint256 amount
    );

    function createMappedToken(
        address _token,
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) public virtual;

    function crossToEvm(
        IERC20 _token,
        address _evmAccount,
        uint256 _amount
    ) public virtual;
}
