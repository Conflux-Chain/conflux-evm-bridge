// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./proxy/BeaconProxy.sol";
import "./UpgradeableERC20.sol";
import "./roles/Ownable.sol";

contract MappedTokenDeployer is Ownable {
    // source token => mapped token
    mapping(address => address) public mappedTokens;
    // mapped token => source token
    mapping(address => address) public sourceTokens;
    address[] public mappedTokenList;
    address public beacon;

    function _deploy(
        address _token,
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) internal returns (address mappedToken) {
        if (mappedTokens[_token] == address(0)) {
            mappedToken = address(
                new BeaconProxy{salt: keccak256(abi.encodePacked(_token))}(
                    beacon,
                    ""
                )
            );
            UpgradeableERC20(mappedToken).initialize(
                _name,
                _symbol,
                _decimals,
                owner()
            );
            mappedTokens[_token] = mappedToken;
            sourceTokens[mappedToken] = _token;
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
