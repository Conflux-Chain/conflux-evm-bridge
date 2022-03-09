// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./interfaces/ICrossSpaceCall.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IEvmSide.sol";
import "./interfaces/IConfluxSide.sol";
import "./libraries/SafeERC20.sol";
import "./utils/ReentrancyGuard.sol";
import "./MappedTokenDeployer.sol";
import "./UpgradeableERC20.sol";

contract ConfluxSide is IConfluxSide, MappedTokenDeployer, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ICrossSpaceCall public crossSpaceCall;

    address public override evmSide;

    bool public initialized;

    function initialize(address _evmSide, address _beacon) public {
        require(!initialized, "ConfluxSide: initialized");
        initialized = true;

        evmSide = _evmSide;
        beacon = _beacon;

        crossSpaceCall = ICrossSpaceCall(
            0x0888000000000000000000000000000000000006
        );

        crossSpaceCall.callEVM(
            bytes20(evmSide),
            abi.encodeWithSelector(IEvmSide.setCfxSide.selector)
        );

        _transferOwnership(msg.sender);
    }

    // register token metadata to evm space
    function registerMetadata(IERC20 _token) public override {
        require(
            sourceTokens[address(_token)] == address(0),
            "ConfluxSide: token is mapped from evm space"
        );

        crossSpaceCall.callEVM(
            bytes20(evmSide),
            abi.encodeWithSelector(
                IEvmSide.registerCRC20.selector,
                address(_token),
                _token.name(),
                _token.symbol(),
                _token.decimals()
            )
        );
    }

    // CRC20 to EVM space
    function crossToEvm(
        IERC20 _token,
        address _evmAccount,
        uint256 _amount
    ) public override nonReentrant {
        require(
            sourceTokens[address(_token)] == address(0),
            "ConfluxSide: token is mapped from evm space"
        );
        require(_amount > 0, "ConfluxSide: invalid amount");

        _token.safeTransferFrom(msg.sender, address(this), _amount);

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
        require(
            sourceTokens[address(_token)] == address(0),
            "ConfluxSide: token is mapped from evm space"
        );
        require(_amount > 0, "ConfluxSide: invalid amount");

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

    function createMappedToken(address _evmToken) public nonReentrant {
        require(
            mappedTokens[_evmToken] == address(0),
            "ConfluxSide: already created"
        );
        _createMappedToken(_evmToken);
    }

    function _createMappedToken(address _evmToken) internal {
        address t =
            abi.decode(
                crossSpaceCall.callEVM(
                    bytes20(evmSide),
                    abi.encodeWithSelector(
                        IMappedTokenDeployer.sourceTokens.selector,
                        _evmToken
                    )
                ),
                (address)
            );
        require(
            t == address(0),
            "ConfluxSide: token is mapped from core space"
        );
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
    }

    // cross ERC20 from EVM space
    function crossFromEvm(
        address _evmToken,
        address _evmAccount,
        uint256 _amount
    ) public override nonReentrant {
        require(_amount > 0, "ConfluxSide: invalid amount");

        if (mappedTokens[_evmToken] == address(0)) {
            _createMappedToken(_evmToken);
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

        UpgradeableERC20(mappedTokens[_evmToken]).mint(msg.sender, _amount);

        emit CrossFromEvm(_evmToken, msg.sender, _evmAccount, _amount);
    }

    // withdraw ERC20 to EVM space
    function withdrawToEvm(
        address _evmToken,
        address _evmAccount,
        uint256 _amount
    ) public override nonReentrant {
        require(
            mappedTokens[_evmToken] != address(0),
            "ConfluxSide: not mapped token"
        );
        require(_amount > 0, "ConfluxSide: invalid amount");

        UpgradeableERC20(mappedTokens[_evmToken]).transferFrom(
            msg.sender,
            address(this),
            _amount
        );
        UpgradeableERC20(mappedTokens[_evmToken]).burn(_amount);

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
