// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./interfaces/ICrossSpaceCall.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IEvmSide.sol";
import "./interfaces/IConfluxSide.sol";
import "./libraries/SafeERC20.sol";
import "./utils/ReentrancyGuard.sol";
import "./roles/Ownable.sol";
import "./MappedTokenDeployer.sol";

contract ConfluxSide is
    IConfluxSide,
    MappedTokenDeployer,
    Ownable,
    ReentrancyGuard
{
    using SafeERC20 for IERC20;

    ICrossSpaceCall constant crossSpaceCall =
        ICrossSpaceCall(0x0888000000000000000000000000000000000006);

    address public evmSide;

    function setEvmSide(address _evmSide) public onlyOwner {
        require(evmSide == address(0), "ConfluxSide: evm side set already");
        evmSide = _evmSide;
    }

    function createMappedToken(
        address _token,
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) public override {
        require(msg.sender == evmSide, "ConfluxSide: sender is not evm side");
        _deploy(_token, _name, _symbol, _decimals);
    }

    // CRC20 to EVM space
    function crossToEvm(
        IERC20 _token,
        address _evmAccount,
        uint256 _amount
    ) public override nonReentrant {
        _token.safeTransferFrom(msg.sender, address(this), _amount);

        crossSpaceCall.callEVM(
            bytes20(evmSide),
            abi.encodeWithSelector(
                IEvmSide.createMappedToken.selector,
                address(_token),
                _token.name(),
                _token.symbol(),
                _token.decimals()
            )
        );

        crossSpaceCall.callEVM(
            bytes20(evmSide),
            abi.encodeWithSelector(
                IEvmSide.mint.selector,
                address(_token),
                _evmAccount,
                _amount
            )
        );

        emit CrossToEvm(address(_token), _evmAccount, _amount);
    }

    // withdraw CRC20 from EVM space
}
