// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Solo para `npm run probar-pvm`: comprueba en PolkaVM (dry-run, sin desplegar)
/// que la verificación de firma de RegistroCertificados funciona igual que en EVM.
/// El constructor revierte si la llave recuperada no es la esperada.
contract ProbarFirma {
    error NoCoincide(address recuperada);

    constructor(bytes32 mensaje, bytes memory firma, address esperada) {
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", mensaje));
        address r = _recuperar(digest, firma);
        if (r != esperada) revert NoCoincide(r);
    }

    function _recuperar(bytes32 digest, bytes memory firma) private pure returns (address) {
        if (firma.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(firma, 32))
            s := mload(add(firma, 64))
            v := byte(0, mload(add(firma, 96)))
        }
        if (v < 27) v += 27;
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }
}
