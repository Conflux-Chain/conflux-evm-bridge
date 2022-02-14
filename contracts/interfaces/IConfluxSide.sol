// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./IERC20.sol";

abstract contract IConfluxSide {
    event CrossToEvm(
        address indexed token,
        address indexed cfxAccount,
        address indexed evmAccount,
        uint256 amount
    );

    event CrossFromEvm(
        address indexed token,
        address indexed cfxAccount,
        address indexed evmAccount,
        uint256 amount
    );

    event WithdrawFromEvm(
        address indexed token,
        address indexed cfxAccount,
        address indexed evmAccount,
        uint256 amount
    );

    event WithdrawToEvm(
        address indexed token,
        address indexed cfxAccount,
        address indexed evmAccount,
        uint256 amount
    );

    function evmSide() external view virtual returns (address);

    function registerMetadata(IERC20 _token) public virtual;

    function crossToEvm(
        IERC20 _token,
        address _evmAccount,
        uint256 _amount
    ) public virtual;

    function withdrawFromEvm(
        IERC20 _token,
        address _evmAccount,
        uint256 _amount
    ) public virtual;

    function crossFromEvm(
        address _evmToken,
        address _evmAccount,
        uint256 _amount
    ) public virtual;

    function withdrawToEvm(
        address _evmToken,
        address _evmAccount,
        uint256 _amount
    ) public virtual;
}
