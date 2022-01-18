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

    address public override evmSide;
    mapping(address => address) public override sourceTokens;

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

        emit CrossToEvm(address(_token), msg.sender, _evmAccount, _amount);
    }

    // withdraw CRC20 from EVM space
    function withdrawFromEvm(
        IERC20 _token,
        address _evmAccount,
        uint256 _amount
    ) public override nonReentrant {
        crossSpaceCall.callEVM(
            bytes20(evmSide),
            abi.encodeWithSelector(
                IEvmSide.burn.selector,
                address(_token),
                _evmAccount,
                msg.sender,
                _amount
            )
        );

        _token.safeTransfer(msg.sender, _amount);

        emit WithdrawFromEvm(address(_token), msg.sender, _evmAccount, _amount);
    }

    // cross ERC20 from EVM space
    function crossFromEvm(
        address _evmToken,
        address _evmAccount,
        uint256 _amount
    ) public override nonReentrant {
        if (mappedTokens[_evmToken] == address(0)) {
            (string memory name, string memory symbol, uint8 decimals) =
                abi.decode(
                    crossSpaceCall.callEVM(
                        bytes20(evmSide),
                        abi.encodeWithSelector(
                            IEvmSide.getTokenData.selector,
                            _evmToken
                        )
                    ),
                    (string, string, uint8)
                );
            _deploy(_evmToken, name, symbol, decimals);
            sourceTokens[mappedTokens[_evmToken]] = _evmToken;
        }

        crossSpaceCall.callEVM(
            bytes20(evmSide),
            abi.encodeWithSelector(
                IEvmSide.crossToCfx.selector,
                _evmToken,
                _evmAccount,
                msg.sender,
                _amount
            )
        );

        MappedToken(mappedTokens[_evmToken]).mint(msg.sender, _amount);

        emit CrossFromEvm(_evmToken, msg.sender, _evmAccount, _amount);
    }

    // withdraw ERC20 to EVM space
    function withdrawToEvm(
        address _evmToken,
        address _evmAccount,
        uint256 _amount
    ) public override nonReentrant {
        MappedToken(mappedTokens[_evmToken]).burn(msg.sender, _amount);

        crossSpaceCall.callEVM(
            bytes20(evmSide),
            abi.encodeWithSelector(
                IEvmSide.withdrawFromCfx.selector,
                _evmToken,
                _evmAccount,
                _amount
            )
        );

        emit WithdrawToEvm(_evmToken, msg.sender, _evmAccount, _amount);
    }
}
