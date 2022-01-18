// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./MappedToken.sol";

contract MappedTokenDeployer {
    mapping(address => address) public mappedTokens;

    function _deploy(
        address _token,
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) internal returns (address mappedToken) {
        if (mappedTokens[_token] == address(0)) {
            mappedToken = address(
                new MappedToken{salt: keccak256(abi.encodePacked(_token))}(
                    _token,
                    _name,
                    _symbol,
                    _decimals
                )
            );
            mappedTokens[_token] = mappedToken;
        } else {
            mappedToken = mappedTokens[_token];
        }
    }
}
