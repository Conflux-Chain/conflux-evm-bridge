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

    mapping(address => uint256) public crossTypes;
    mapping(address => address) public peggedTokens;

    /*=== cross types ===*/
    uint256 public constant MINT_BURN = 0;
    uint256 public constant LIQUIDITY_POOL = 1;

    /*=== events ===*/
    event LiquidityAdded(address token, uint256 amount, address account);
    event LiquidityRemoved(address token, uint256 amount, address account);

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

    function _getAmountOut(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) internal returns (uint256) {
        uint8 decimalsIn = IERC20(_tokenIn).decimals();
        uint8 decimalsOut =
            abi.decode(
                crossSpaceCall.callEVM(
                    bytes20(_tokenOut),
                    abi.encodeWithSelector(IERC20.decimals.selector)
                ),
                (uint8)
            );
        return (_amountIn * (10**decimalsOut)) / (10**decimalsIn);
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
                _getAmountOut(mappedTokens[_evmToken], _evmToken, _amount)
            )
        );

        if (crossTypes[_evmToken] == MINT_BURN) {
            UpgradeableERC20(mappedTokens[_evmToken]).mint(msg.sender, _amount);
        } else {
            IERC20(mappedTokens[_evmToken]).safeTransfer(msg.sender, _amount);
        }

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
        if (crossTypes[_evmToken] == MINT_BURN) {
            UpgradeableERC20(mappedTokens[_evmToken]).burn(_amount);
        }

        crossSpaceCall.callEVM(
            bytes20(evmSide),
            abi.encodeWithSelector(
                IEvmSide.withdrawFromCfx.selector,
                _evmToken,
                _evmAccount,
                _getAmountOut(mappedTokens[_evmToken], _evmToken, _amount)
            )
        );

        emit WithdrawToEvm(_evmToken, msg.sender, _evmAccount, _amount);
    }

    /*=== liquidity ===*/
    /**
     * @dev change the cross type of eSpace _evmToken to liquidity pool.
     * @param _evmToken Token address in eSpace
     * @param _mappedToken Token address in core space
     * @param _peggedToken Pegged token address in core space
     */
    function createPool(
        address _evmToken,
        address _mappedToken,
        address _peggedToken
    ) external onlyOwner {
        crossTypes[_evmToken] = LIQUIDITY_POOL;
        if (mappedTokens[_evmToken] == address(0)) {
            mappedTokenList.push(_evmToken);
        }
        _setMappedToken(_evmToken, _mappedToken);
        peggedTokens[_mappedToken] = _peggedToken;
    }

    function _setMappedToken(address _token, address _mappedToken) internal {
        if (mappedTokens[_token] != address(0)) {
            sourceTokens[mappedTokens[_token]] = address(0);
        }
        mappedTokens[_token] = _mappedToken;
        if (_mappedToken != address(0)) {
            sourceTokens[_mappedToken] = _token;
        }
    }

    function setMappedToken(address _token, address _mappedToken)
        external
        onlyOwner
    {
        _setMappedToken(_token, _mappedToken);
    }

    function setPeggedToken(address _token, address _peggedToken)
        external
        onlyOwner
    {
        peggedTokens[_token] = _peggedToken;
    }

    function _validateLiquidityToken(address _token) internal view {
        require(peggedTokens[_token] != address(0), "CfxSide: invalid token");
    }

    /// @notice Add liquidity to bridge. The sender will receive the same amount of pegged token in exchange.
    /// @param _token The token to add.
    /// @param _amount Token amount.
    function addLiquidity(address _token, uint256 _amount)
        external
        nonReentrant
    {
        require(_amount > 0, "CfxSide: zero amount");
        _validateLiquidityToken(_token);
        address peggedToken = peggedTokens[_token];
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        UpgradeableERC20(peggedToken).mint(msg.sender, _amount);
        emit LiquidityAdded(_token, _amount, msg.sender);
    }

    /// @notice Remove liquidity from bridge. The sender will burn the pegged token and withdraw the original token.
    /// @param _token The token to withdraw.
    /// @param _amount Token amount.
    function removeLiquidity(address _token, uint256 _amount)
        external
        nonReentrant
    {
        require(_amount > 0, "CfxSide: zero amount");
        _validateLiquidityToken(_token);
        address peggedToken = peggedTokens[_token];
        UpgradeableERC20(peggedToken).burnFrom(msg.sender, _amount);
        require(
            IERC20(_token).balanceOf(address(this)) >= _amount,
            "CfxSide: insufficient liquidity"
        );
        IERC20(_token).safeTransfer(msg.sender, _amount);
        emit LiquidityRemoved(_token, _amount, msg.sender);
    }

    /**
     * @dev Cross the liquidity to eSpace. This is useful when a token's cross type is switched from MINT_BURN to
     *      LIQUIDITY_POOL.
     * @param _evmToken eSpace token to cross
     * @param _evmAccount Receive address in core space
     * @param _amount Cross amount
     */
    function crossLiquidity(
        address _evmToken,
        address _evmAccount,
        uint256 _amount
    ) public nonReentrant {
        require(
            mappedTokens[_evmToken] != address(0),
            "ConfluxSide: not mapped token"
        );
        require(
            crossTypes[_evmToken] == LIQUIDITY_POOL,
            "ConfluxSide: cross type not match"
        );
        _validateLiquidityToken(mappedTokens[_evmToken]);

        address peggedToken = peggedTokens[mappedTokens[_evmToken]];
        UpgradeableERC20(peggedToken).burnFrom(msg.sender, _amount);

        crossSpaceCall.callEVM(
            bytes20(evmSide),
            abi.encodeWithSelector(
                IEvmSide.withdrawFromCfx.selector,
                _evmToken,
                _evmAccount,
                _getAmountOut(mappedTokens[_evmToken], _evmToken, _amount)
            )
        );

        emit WithdrawToEvm(_evmToken, msg.sender, _evmAccount, _amount);
    }
}
