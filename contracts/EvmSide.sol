// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./interfaces/IEvmSide.sol";
import "./interfaces/IERC20.sol";
import "./libraries/SafeERC20.sol";
import "./utils/ReentrancyGuard.sol";
import "./MappedTokenDeployer.sol";

contract EvmSide is IEvmSide, MappedTokenDeployer, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public override cfxSide;

    mapping(address => TokenMetadata) crc20Metadata;

    mapping(address => mapping(address => mapping(address => uint256)))
        public
        override lockedMappedToken;

    mapping(address => mapping(address => mapping(address => uint256)))
        public
        override lockedToken;

    function setCfxSide() public override {
        require(cfxSide == address(0), "EvmSide: cfx side set already");
        cfxSide = msg.sender;
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
        require(crc20Metadata[_crc20].decimals == 0, "EvmSide: registered");
        TokenMetadata memory d;
        d.name = _name;
        d.symbol = _symbol;
        d.decimals = _decimals;

        crc20Metadata[_crc20] = d;
    }

    function createMappedToken(address _crc20) public override {
        require(crc20Metadata[_crc20].decimals > 0, "EvmSide: not registered");
        TokenMetadata memory d = crc20Metadata[_crc20];
        _deploy(_crc20, d.name, d.symbol, d.decimals);
    }

    // mint mapped CRC20
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
        MappedToken(mappedTokens[_token]).mint(_to, _amount);
    }

    // burn locked mapped CRC20
    function burn(
        address _token,
        address _evmAccount,
        address _cfxAccount,
        uint256 _amount
    ) public override nonReentrant {
        require(msg.sender == cfxSide, "EvmSide: sender is not cfx side");
        address mappedToken = mappedTokens[_token];
        uint256 lockedAmount =
            lockedMappedToken[mappedToken][_evmAccount][_cfxAccount];
        require(lockedAmount >= _amount, "EvmSide: insufficent lock");
        MappedToken(mappedToken).burn(address(this), _amount);
        lockedAmount -= _amount;
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
        uint256 oldAmount =
            lockedMappedToken[_mappedToken][msg.sender][_cfxAccount];
        if (oldAmount > 0) {
            MappedToken(_mappedToken).transfer(msg.sender, oldAmount);
        }

        if (_amount > 0) {
            MappedToken(_mappedToken).transferFrom(
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
}
