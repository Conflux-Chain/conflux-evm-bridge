// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IMappedTokenDeployer {
    function mappedTokens(address token) external view returns (address);

    function sourceTokens(address token) external view returns (address);

    function getTokens(uint256 offset)
        external
        view
        returns (address[] memory result, uint256 cnt);
}
