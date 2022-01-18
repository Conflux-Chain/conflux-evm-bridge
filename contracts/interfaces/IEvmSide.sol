// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

abstract contract IEvmSide {
    function cfxSide() external view virtual returns (address);

    function lockedMappedToken(address token, address cfxAccount)
        external
        view
        virtual
        returns (uint256);

    function createMappedToken(
        address _token,
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) public virtual;

    function mint(
        address _token,
        address _to,
        uint256 _amount
    ) public virtual;

    function lockMappedToken(
        address _mappedToken,
        address _cfxAccount,
        uint256 _amount
    ) public virtual;
}
