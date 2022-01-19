// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./IERC20.sol";

abstract contract IEvmSide {
    event LockedMappedToken(
        address indexed mappedToken,
        address indexed evmAccount,
        address indexed cfxAccount,
        uint256 amount
    );

    event LockedToken(
        address indexed token,
        address indexed evmAccount,
        address indexed cfxAccount,
        uint256 amount
    );

    function cfxSide() external view virtual returns (address);

    function setCfxSide() public virtual;

    function getTokenData(address _token)
        public
        view
        virtual
        returns (
            string memory,
            string memory,
            uint8
        );

    function lockedMappedToken(
        address _token,
        address _evmAccount,
        address _cfxAccount
    ) external view virtual returns (uint256);

    function lockedToken(
        address _token,
        address _evmAccount,
        address _cfxAccount
    ) external view virtual returns (uint256);

    function registerMappedToken(address _token, address _mappedToken)
        public
        virtual;

    function mint(
        address _token,
        address _to,
        uint256 _amount
    ) public virtual;

    function burn(
        address _token,
        address _evmAccount,
        address _cfxAccount,
        uint256 _amount
    ) public virtual;

    function lockMappedToken(
        address _mappedToken,
        address _cfxAccount,
        uint256 _amount
    ) public virtual;

    function lockToken(
        IERC20 _token,
        address _cfxAccount,
        uint256 _amount
    ) public virtual;

    function crossToCfx(
        address _token,
        address _evmAccount,
        address _cfxAccount,
        uint256 _amount
    ) public virtual;

    function withdrawFromCfx(
        address _token,
        address _evmAccount,
        uint256 _amount
    ) public virtual;
}
