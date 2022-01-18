// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./MappedToken.sol";

contract MappedTokenDeployer {
    mapping(address => address) public mappedTokens;
    address[] public mappedTokenList;

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
            mappedTokenList.push(_token);
        } else {
            mappedToken = mappedTokens[_token];
        }
    }

    function getTokens(uint256 offset)
        public
        view
        returns (address[] memory result, uint256 cnt)
    {
        cnt = mappedTokenList.length;
        uint256 n = offset + 100 < cnt ? offset + 100 : cnt;
        if (n > offset) {
            result = new address[](n - offset);
            for (uint256 i = offset; i < n; ++i) {
                result[i - offset] = mappedTokenList[i];
            }
        }
    }
}
