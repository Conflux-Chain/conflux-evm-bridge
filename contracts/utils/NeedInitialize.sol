// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

contract NeedInitialize {
    bool public initialized;

    modifier onlyInitializeOnce() {
        require(!initialized, "NeedInitialize: already initialized");
        _;
        initialized = true;
    }
}
