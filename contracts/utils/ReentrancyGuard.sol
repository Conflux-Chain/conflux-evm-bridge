// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

contract ReentrancyGuard {
    // Locked state of mutex
    bool private locked = false;

    /// @dev Functions with this modifer cannot be reentered. The mutex will be locked
    ///      before function execution and unlocked after.
    modifier nonReentrant() {
        // Ensure mutex is unlocked
        require(!locked, "REENTRANCY_ILLEGAL");

        // Lock mutex before function call
        locked = true;

        // Perform function call
        _;

        // Unlock mutex after function call
        locked = false;
    }
}
