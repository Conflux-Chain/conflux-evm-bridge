// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "./erc20/ERC20.sol";
import "./erc20/ERC20Pausable.sol";
import "./access/AccessControlEnumerable.sol";

contract UpgradeableERC20 is ERC20, ERC20Pausable, AccessControlEnumerable {
    struct Supply {
        uint256 cap;
        uint256 total;
    }

    event MinterCapUpdated(address indexed minter, uint256 cap);

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    bool public initialized;

    mapping(address => Supply) public minterSupply;

    function initialize(
        string memory _name,
        string memory _symbol,
        uint8 _decimals,
        address admin
    ) public {
        require(!initialized, "initialized already");
        initialized = true;

        setName(_name);
        setSymbol(_symbol);
        setDecimals(_decimals);

        _setupRole(DEFAULT_ADMIN_ROLE, admin);
        _setupRole(PAUSER_ROLE, admin);

        _setupRole(MINTER_ROLE, _msgSender());

        minterSupply[_msgSender()].cap = type(uint256).max;
        emit MinterCapUpdated(_msgSender(), type(uint256).max);
    }

    /**
     * @dev Creates `amount` new tokens for `to`.
     *
     * See {ERC20-_mint}.
     *
     * Requirements:
     *
     * - the caller must have the `MINTER_ROLE`.
     */
    function mint(address to, uint256 amount) public virtual {
        require(
            hasRole(MINTER_ROLE, _msgSender()),
            "UpgradeableERC20: must have minter role to mint"
        );
        Supply storage s = minterSupply[msg.sender];
        s.total += amount;
        require(s.total <= s.cap, "UpgradeableERC20: minter cap exceeded");
        _mint(to, amount);
    }

    function getMinterCap(address minter) external view returns (uint256) {
        return minterSupply[minter].cap;
    }

    function setMinterCap(address minter, uint256 cap)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        minterSupply[minter].cap = cap;
        emit MinterCapUpdated(minter, cap);
    }

    function setMetadata(string memory _name, string memory _symbol)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        setName(_name);
        setSymbol(_symbol);
    }

    function burn(uint256 amount) public virtual {
        _burn(_msgSender(), amount);
    }

    function burnFrom(address account, uint256 amount) public virtual {
        Supply storage s = minterSupply[_msgSender()];
        if (s.cap > 0 || s.total > 0) {
            require(
                s.total >= amount,
                "UpgradeableERC20: burn amount exceeds minter total supply"
            );
            unchecked {
                s.total -= amount;
            }
        }
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }

    // alternative burn function, same as burnFrom
    function burn(address account, uint256 amount) public virtual {
        burnFrom(account, amount);
    }

    /**
     * @dev Pauses all token transfers.
     *
     * See {ERC20Pausable} and {Pausable-_pause}.
     *
     * Requirements:
     *
     * - the caller must have the `PAUSER_ROLE`.
     */
    function pause() public virtual {
        require(
            hasRole(PAUSER_ROLE, _msgSender()),
            "UpgradeableERC20: must have pauser role to pause"
        );
        _pause();
    }

    /**
     * @dev Unpauses all token transfers.
     *
     * See {ERC20Pausable} and {Pausable-_unpause}.
     *
     * Requirements:
     *
     * - the caller must have the `PAUSER_ROLE`.
     */
    function unpause() public virtual {
        require(
            hasRole(PAUSER_ROLE, _msgSender()),
            "UpgradeableERC20: must have pauser role to unpause"
        );
        _unpause();
    }

    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override(ERC20, ERC20Pausable) {
        super._beforeTokenTransfer(from, to, amount);
    }
}
