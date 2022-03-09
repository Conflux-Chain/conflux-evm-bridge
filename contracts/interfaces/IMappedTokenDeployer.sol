// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

abstract contract IMappedTokenDeployer {
    function mappedTokens(address token)
        external
        view
        virtual
        returns (address);

    function sourceTokens(address token)
        external
        view
        virtual
        returns (address);

    function mappedTokenList(uint256 index)
        external
        view
        virtual
        returns (address);

    function beacon() external view virtual returns (address);

    function getTokens(uint256 offset)
        external
        view
        virtual
        returns (address[] memory result, uint256 cnt);
}
