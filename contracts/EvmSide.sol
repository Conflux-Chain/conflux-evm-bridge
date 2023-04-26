// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./interfaces/IEvmSide.sol";
import "./interfaces/IERC20.sol";
import "./libraries/SafeERC20.sol";
import "./utils/ReentrancyGuard.sol";
import "./MappedTokenDeployer.sol";
import "./UpgradeableERC20.sol";

contract EvmSide is IEvmSide, MappedTokenDeployer, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public override cfxSide;

    mapping(address => TokenMetadata) public crc20Metadata;

    mapping(address => mapping(address => mapping(address => uint256)))
        public
        override lockedMappedToken;

    mapping(address => mapping(address => mapping(address => uint256)))
        public
        override lockedToken;

    bool public initialized;

    mapping(address => uint256) public crossTypes;
    mapping(address => address) public peggedTokens;

    /*=== cross types ===*/
    uint256 public constant MINT_BURN = 0;
    uint256 public constant LIQUIDITY_POOL = 1;

    /*=== events ===*/
    event LiquidityAdded(address token, uint256 amount, address account);
    event LiquidityRemoved(address token, uint256 amount, address account);

    function setCfxSide() public override {
        require(cfxSide == address(0), "EvmSide: cfx side set already");
        cfxSide = msg.sender;
    }

    function initialize(address _beacon) public {
        require(!initialized, "EvmSide: initialized");
        initialized = true;

        beacon = _beacon;

        _transferOwnership(msg.sender);
    }

    function getTokenData(address _token)
        public
        view
        override
        returns (
            string memory,
            string memory,
            uint8
        )
    {
        return (
            IERC20(_token).name(),
            IERC20(_token).symbol(),
            IERC20(_token).decimals()
        );
    }

    function registerCRC20(
        address _crc20,
        string memory _name,
        string memory _symbol,
        uint8 _decimals
    ) public override nonReentrant {
        require(msg.sender == cfxSide, "EvmSide: sender is not cfx side");
        require(!crc20Metadata[_crc20].registered, "EvmSide: registered");
        TokenMetadata memory d;
        d.name = _name;
        d.symbol = _symbol;
        d.decimals = _decimals;
        d.registered = true;

        crc20Metadata[_crc20] = d;
    }

    function createMappedToken(address _crc20) public override {
        require(crc20Metadata[_crc20].registered, "EvmSide: not registered");
        TokenMetadata memory d = crc20Metadata[_crc20];
        _deploy(_crc20, d.name, d.symbol, d.decimals);
    }

    function _getAmountOut(
        address _tokenIn,
        address _tokenOut,
        uint256 _amountIn
    ) internal view returns (uint256) {
        require(crc20Metadata[_tokenIn].registered, "EvmSide: not registered");
        uint8 decimalsIn = crc20Metadata[_tokenIn].decimals;
        uint8 decimalsOut = IERC20(_tokenOut).decimals();
        return (_amountIn * (10**decimalsOut)) / (10**decimalsIn);
    }

    // mint mapped CRC20 or transfer mapped token to receiver, based on cross type
    function mint(
        address _token,
        address _to,
        uint256 _amount
    ) public override nonReentrant {
        require(msg.sender == cfxSide, "EvmSide: sender is not cfx side");
        require(
            mappedTokens[_token] != address(0),
            "EvmSide: token is not mapped"
        );
        uint256 amountOut =
            _getAmountOut(_token, mappedTokens[_token], _amount);
        if (crossTypes[_token] == MINT_BURN) {
            UpgradeableERC20(mappedTokens[_token]).mint(_to, amountOut);
        } else if (crossTypes[_token] == LIQUIDITY_POOL) {
            IERC20(mappedTokens[_token]).safeTransfer(_to, amountOut);
        }
    }

    // burn locked mapped CRC20 or just deduct locked balance based on cross type
    function burn(
        address _token,
        address _evmAccount,
        address _cfxAccount,
        uint256 _amount
    ) public override nonReentrant {
        require(msg.sender == cfxSide, "EvmSide: sender is not cfx side");
        require(
            mappedTokens[_token] != address(0),
            "EvmSide: token is not mapped"
        );
        uint256 amountOut =
            _getAmountOut(_token, mappedTokens[_token], _amount);
        address mappedToken = mappedTokens[_token];
        uint256 lockedAmount =
            lockedMappedToken[mappedToken][_evmAccount][_cfxAccount];
        require(lockedAmount >= amountOut, "EvmSide: insufficent lock");
        if (crossTypes[_token] == MINT_BURN) {
            UpgradeableERC20(mappedToken).burn(amountOut);
        }
        lockedAmount -= amountOut;
        lockedMappedToken[mappedToken][_evmAccount][_cfxAccount] = lockedAmount;

        emit LockedMappedToken(
            mappedToken,
            _evmAccount,
            _cfxAccount,
            lockedAmount
        );
    }

    // lock mapped CRC20 for a conflux space address
    function lockMappedToken(
        address _mappedToken,
        address _cfxAccount,
        uint256 _amount
    ) public override nonReentrant {
        require(
            sourceTokens[_mappedToken] != address(0),
            "EvmSide: not mapped token"
        );

        uint256 oldAmount =
            lockedMappedToken[_mappedToken][msg.sender][_cfxAccount];
        if (oldAmount > 0) {
            UpgradeableERC20(_mappedToken).transfer(msg.sender, oldAmount);
        }

        if (_amount > 0) {
            UpgradeableERC20(_mappedToken).transferFrom(
                msg.sender,
                address(this),
                _amount
            );
        }
        lockedMappedToken[_mappedToken][msg.sender][_cfxAccount] = _amount;

        emit LockedMappedToken(_mappedToken, msg.sender, _cfxAccount, _amount);
    }

    // lock ERC20 for a conflux space address
    function lockToken(
        IERC20 _token,
        address _cfxAccount,
        uint256 _amount
    ) public override nonReentrant {
        require(
            sourceTokens[address(_token)] == address(0),
            "EvmSide: token is mapped from core space"
        );

        uint256 oldAmount =
            lockedToken[address(_token)][msg.sender][_cfxAccount];
        if (oldAmount > 0) {
            _token.safeTransfer(msg.sender, oldAmount);
        }

        if (_amount > 0) {
            _token.safeTransferFrom(msg.sender, address(this), _amount);
        }
        lockedToken[address(_token)][msg.sender][_cfxAccount] = _amount;

        emit LockedToken(address(_token), msg.sender, _cfxAccount, _amount);
    }

    // cross ERC20 to conflux space
    function crossToCfx(
        address _token,
        address _evmAccount,
        address _cfxAccount,
        uint256 _amount
    ) public override nonReentrant {
        require(msg.sender == cfxSide, "EvmSide: sender is not cfx side");
        uint256 lockedAmount = lockedToken[_token][_evmAccount][_cfxAccount];
        require(lockedAmount >= _amount, "EvmSide: insufficent lock");
        lockedAmount -= _amount;
        lockedToken[_token][_evmAccount][_cfxAccount] = lockedAmount;

        emit LockedToken(_token, _evmAccount, _cfxAccount, lockedAmount);
    }

    // withdraw from conflux space
    function withdrawFromCfx(
        address _token,
        address _evmAccount,
        uint256 _amount
    ) public override nonReentrant {
        require(msg.sender == cfxSide, "EvmSide: sender is not cfx side");
        IERC20(_token).transfer(_evmAccount, _amount);
    }

    /*=== liquidity ===*/
    /**
     * @dev change the cross type of CRC20 _token to liquidity pool.
     * @param _token Token address in core space
     * @param _mappedToken Token address in eSpace
     * @param _peggedToken Pegged token address in eSpace
     */
    function createPool(
        address _token,
        address _mappedToken,
        address _peggedToken
    ) external onlyOwner {
        crossTypes[_token] = LIQUIDITY_POOL;
        if (mappedTokens[_token] == address(0)) {
            mappedTokenList.push(_token);
        }
        _setMappedToken(_token, _mappedToken);
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
        require(peggedTokens[_token] != address(0), "EvmSide: invalid token");
    }

    /// @notice Add liquidity to bridge. The sender will receive the same amount of pegged token in exchange.
    /// @param _token The token to add.
    /// @param _amount Token amount.
    function addLiquidity(address _token, uint256 _amount)
        external
        nonReentrant
    {
        require(_amount > 0, "EvmSide: zero amount");
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
        require(_amount > 0, "EvmSide: zero amount");
        _validateLiquidityToken(_token);
        address peggedToken = peggedTokens[_token];
        UpgradeableERC20(peggedToken).burnFrom(msg.sender, _amount);
        require(
            IERC20(_token).balanceOf(address(this)) >= _amount,
            "EvmSide: insufficient liquidity"
        );
        IERC20(_token).safeTransfer(msg.sender, _amount);
        emit LiquidityRemoved(_token, _amount, msg.sender);
    }

    /**
     * @dev Cross the liquidity to core space. This is useful when a token's cross type is switched from MINT_BURN to
     *      LIQUIDITY_POOL.
     * @param _token Core space token to cross
     * @param _cfxAccount Receive address in core space
     * @param _amount Cross amount
     */
    function crossLiquidity(
        address _token,
        address _cfxAccount,
        uint256 _amount
    ) external nonReentrant {
        address mappedToken = mappedTokens[_token];
        require(mappedToken != address(0), "EvmSide: not mapped token");
        require(
            crossTypes[_token] == LIQUIDITY_POOL,
            "EvmSide: cross type not match"
        );
        _validateLiquidityToken(mappedToken);

        uint256 oldAmount =
            lockedMappedToken[mappedToken][msg.sender][_cfxAccount];
        if (oldAmount > 0) {
            UpgradeableERC20(mappedToken).transfer(msg.sender, oldAmount);
        }

        if (_amount > 0) {
            UpgradeableERC20(peggedTokens[mappedToken]).burnFrom(
                msg.sender,
                _amount
            );
        }
        lockedMappedToken[mappedToken][msg.sender][_cfxAccount] = _amount;

        emit LockedMappedToken(mappedToken, msg.sender, _cfxAccount, _amount);
    }
}
