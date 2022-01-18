// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./interfaces/IEvmSide.sol";
import "./interfaces/IERC20.sol";
import "./libraries/SafeERC20.sol";
import "./utils/ReentrancyGuard.sol";
import "./roles/Ownable.sol";
import "./MappedTokenDeployer.sol";

contract EvmSide is IEvmSide, MappedTokenDeployer, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public override cfxSide;

    mapping(address => mapping(address => uint256))
        public
        override lockedMappedToken;

    function setCfxSide(address _cfxSide) public onlyOwner {
        require(cfxSide == address(0), "EvmSide: cfx side set already");
        cfxSide = _cfxSide;
    }

    function createMappedToken(
        address _token,
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) public override {
        require(msg.sender == cfxSide, "Evmside: sender is not cfx side");
        _deploy(_token, _name, _symbol, _decimals);
    }

    // mint mapped CRC20
    function mint(
        address _token,
        address _to,
        uint256 _amount
    ) public override {
        require(msg.sender == cfxSide, "Evmside: sender is not cfx side");
        MappedToken(_token).mint(_to, _amount);
    }

    // lock mapped CRC20 for a conflux space address
    function lockMappedToken(
        address _mappedToken,
        address _cfxAccount,
        uint256 _amount
    ) public override {}
}
