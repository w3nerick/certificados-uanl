// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title RegistroCertificados: certificados académicos en Asset Hub
/// @notice Cada certificado guarda inline sus datos públicos (nombre, programa,
///         institución, fecha), la huella sha256 del PDF oficial y su CID de
///         IPFS. El PDF vive en IPFS (Pinata); la cadena guarda la prueba, que no
///         caduca. El correo del estudiante nunca llega aquí.
/// @dev Reclamo con link: al emitir, el organizador genera un código secreto
///      por certificado y guarda aquí solo la dirección de la llave que sale de
///      ese código (`llaveReclamo`). Para reclamar, el estudiante firma con esa
///      llave el par (certificado, titular) y cualquiera puede enviar la firma:
///      el relayer paga la comisión, pero no puede cambiar el titular porque la
///      firma lo fija. Ver de nuevo la transacción en la mempool no sirve para
///      robarla.
///
///      Reclamo por solicitud: el estudiante busca su constancia por nombre en la
///      Polkadot App y pide que se asigne a su cuenta (`solicitar`, lo envía el
///      relayer). Un emisor revisa las solicitudes (nombre del certificado contra el
///      usuario verificado del solicitante) y aprueba en lote con `asignar`.
///      Pedir no da nada: solo un emisor asigna.
///
///      Soulbound por construcción: no existe ninguna función que transfiera.
///      Solo un emisor puede reasignar (para corregir un reclamo con la cuenta
///      equivocada) o revocar.
contract RegistroCertificados {
    struct Certificado {
        string nombre;
        string programa;
        string institucion;
        string cid;
        bytes32 sha256Pdf;
        uint64 fecha;
        uint64 bloque;
        uint64 reclamadoEn;
        address emitidoPor;
        address llaveReclamo;
        address titular;
        bool revocado;
    }

    /// Lo que manda el organizador por certificado.
    /// `titular` distinto de cero emite directo a esa cuenta. `llaveReclamo` distinta de
    /// cero habilita el reclamo por link. Con las dos en cero queda pendiente de solicitud.
    struct Nuevo {
        string nombre;
        string programa;
        string institucion;
        string cid;
        bytes32 sha256Pdf;
        uint64 fecha;
        address llaveReclamo;
        address titular;
    }

    struct Solicitud {
        address titular;
        string usuario;
        uint64 fecha;
    }

    uint256 public constant MAX_TEXTO = 256;
    uint256 public constant MAX_LOTE = 50;
    /// Solicitudes abiertas por certificado: acota el costo que alguien puede hacerle pagar al relayer.
    uint256 public constant MAX_SOLICITUDES = 5;
    uint256 public constant MAX_USUARIO = 64;

    address public admin;
    mapping(address => bool) public emisores;

    mapping(uint256 => Certificado) private certificados;
    mapping(uint256 => string) private motivos;
    mapping(bytes32 => uint256) private idPorPdf;
    mapping(address => uint256[]) private idsDeTitular;
    mapping(uint256 => Solicitud[]) private solicitudesDe;
    uint256 private ultimo;

    event Emitido(uint256 indexed id, bytes32 indexed sha256Pdf, address indexed emitidoPor);
    event Reclamado(uint256 indexed id, address indexed titular);
    event Reasignado(uint256 indexed id, address indexed anterior, address indexed nuevo);
    event Revocado(uint256 indexed id, string motivo);
    event Solicitado(uint256 indexed id, address indexed titular, string usuario);
    event EmisorCambiado(address indexed cuenta, bool activo);
    event AdminCambiado(address indexed anterior, address indexed nuevo);

    error SoloAdmin();
    error SoloEmisor();
    error DireccionVacia();
    error LoteInvalido(uint256 cuantos);
    error TextoInvalido(uint256 indice);
    error PdfVacio(uint256 indice);
    error PdfRepetido(bytes32 sha256Pdf, uint256 id);
    error NoExiste(uint256 id);
    error YaReclamado(uint256 id);
    error EstaRevocado(uint256 id);
    error FirmaInvalida();
    error DemasiadasSolicitudes(uint256 id);
    error YaSolicitado(uint256 id);
    error LargosDistintos();

    modifier soloAdmin() {
        if (msg.sender != admin) revert SoloAdmin();
        _;
    }

    modifier soloEmisor() {
        if (!emisores[msg.sender]) revert SoloEmisor();
        _;
    }

    constructor() {
        admin = msg.sender;
        emisores[msg.sender] = true;
        emit AdminCambiado(address(0), msg.sender);
        emit EmisorCambiado(msg.sender, true);
    }

    // ---------- Administración ----------

    function cambiarEmisor(address cuenta, bool activo) external soloAdmin {
        if (cuenta == address(0)) revert DireccionVacia();
        emisores[cuenta] = activo;
        emit EmisorCambiado(cuenta, activo);
    }

    function cambiarAdmin(address nuevo) external soloAdmin {
        if (nuevo == address(0)) revert DireccionVacia();
        emit AdminCambiado(admin, nuevo);
        admin = nuevo;
    }

    // ---------- Emisión ----------

    /// Emite un lote; devuelve el primer id (los demás son consecutivos).
    function emitir(Nuevo[] calldata lote) external soloEmisor returns (uint256 primero) {
        if (lote.length == 0 || lote.length > MAX_LOTE) revert LoteInvalido(lote.length);
        primero = ultimo + 1;
        for (uint256 i = 0; i < lote.length; i++) {
            Nuevo calldata n = lote[i];
            _validar(n, i);
            uint256 id = ++ultimo;
            Certificado storage c = certificados[id];
            c.nombre = n.nombre;
            c.programa = n.programa;
            c.institucion = n.institucion;
            c.cid = n.cid;
            c.sha256Pdf = n.sha256Pdf;
            c.fecha = n.fecha;
            c.bloque = uint64(block.number);
            c.emitidoPor = msg.sender;
            c.llaveReclamo = n.llaveReclamo;
            idPorPdf[n.sha256Pdf] = id;
            emit Emitido(id, n.sha256Pdf, msg.sender);
            if (n.titular != address(0)) _asignar(id, c, n.titular);
        }
    }

    function _validar(Nuevo calldata n, uint256 i) private view {
        if (!_textoOk(n.nombre, false) || !_textoOk(n.programa, false) || !_textoOk(n.institucion, false) || !_textoOk(n.cid, true)) {
            revert TextoInvalido(i);
        }
        if (n.sha256Pdf == bytes32(0)) revert PdfVacio(i);
        uint256 previo = idPorPdf[n.sha256Pdf];
        if (previo != 0) revert PdfRepetido(n.sha256Pdf, previo);
    }

    function _textoOk(string calldata s, bool puedeIrVacio) private pure returns (bool) {
        uint256 len = bytes(s).length;
        return len <= MAX_TEXTO && (puedeIrVacio || len > 0);
    }

    // ---------- Reclamo ----------

    /// Mensaje que firma la llave de reclamo (sin el prefijo EIP-191).
    function mensajeReclamo(uint256 id, address titular) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), id, titular));
    }

    /// Cualquiera puede enviarlo; la firma de la llave de reclamo fija el titular.
    function reclamar(uint256 id, address titular, bytes calldata firma) external {
        Certificado storage c = _existente(id);
        if (c.revocado) revert EstaRevocado(id);
        if (c.titular != address(0)) revert YaReclamado(id);
        if (titular == address(0)) revert DireccionVacia();
        bytes32 digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", mensajeReclamo(id, titular)));
        if (c.llaveReclamo == address(0) || _recuperar(digest, firma) != c.llaveReclamo) revert FirmaInvalida();
        _asignar(id, c, titular);
    }

    function _recuperar(bytes32 digest, bytes calldata firma) private pure returns (address) {
        if (firma.length != 65) return address(0);
        bytes32 r = bytes32(firma[0:32]);
        bytes32 s = bytes32(firma[32:64]);
        uint8 v = uint8(firma[64]);
        if (v < 27) v += 27;
        // s en la mitad baja de la curva (EIP-2): sin firmas maleables.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        if (v != 27 && v != 28) return address(0);
        return ecrecover(digest, v, r, s);
    }

    function _asignar(uint256 id, Certificado storage c, address titular) private {
        c.titular = titular;
        c.reclamadoEn = uint64(block.timestamp);
        idsDeTitular[titular].push(id);
        delete solicitudesDe[id];
        emit Reclamado(id, titular);
    }

    // ---------- Solicitud + aprobación ----------

    /// Pide que el certificado `id` se asigne a `titular`. Lo puede enviar cualquiera
    /// (normalmente el relayer); no asigna nada por sí mismo.
    function solicitar(uint256 id, address titular, string calldata usuario) external {
        Certificado storage c = _existente(id);
        if (c.revocado) revert EstaRevocado(id);
        if (c.titular != address(0)) revert YaReclamado(id);
        if (titular == address(0)) revert DireccionVacia();
        if (bytes(usuario).length > MAX_USUARIO) revert TextoInvalido(0);
        Solicitud[] storage lista = solicitudesDe[id];
        for (uint256 i = 0; i < lista.length; i++) if (lista[i].titular == titular) revert YaSolicitado(id);
        if (lista.length >= MAX_SOLICITUDES) revert DemasiadasSolicitudes(id);
        lista.push(Solicitud({ titular: titular, usuario: usuario, fecha: uint64(block.timestamp) }));
        emit Solicitado(id, titular, usuario);
    }

    /// Aprueba en lote: asigna cada certificado a su titular (que no tenga ya uno).
    function asignar(uint256[] calldata ids, address[] calldata titulares) external soloEmisor {
        if (ids.length != titulares.length) revert LargosDistintos();
        if (ids.length == 0 || ids.length > MAX_LOTE) revert LoteInvalido(ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            Certificado storage c = _existente(ids[i]);
            if (c.revocado) revert EstaRevocado(ids[i]);
            if (c.titular != address(0)) revert YaReclamado(ids[i]);
            if (titulares[i] == address(0)) revert DireccionVacia();
            _asignar(ids[i], c, titulares[i]);
        }
    }

    // ---------- Correcciones ----------

    /// Cambia el titular (p. ej. se reclamó con el usuario equivocado).
    /// `nuevo` = 0 reabre el reclamo con el mismo link.
    function reasignar(uint256 id, address nuevo) external soloEmisor {
        Certificado storage c = _existente(id);
        address anterior = c.titular;
        if (anterior != address(0)) _quitarDe(anterior, id);
        emit Reasignado(id, anterior, nuevo);
        if (nuevo == address(0)) {
            c.titular = address(0);
            c.reclamadoEn = 0;
        } else {
            _asignar(id, c, nuevo);
        }
    }

    function revocar(uint256 id, string calldata motivo) external soloEmisor {
        Certificado storage c = _existente(id);
        if (c.revocado) revert EstaRevocado(id);
        if (bytes(motivo).length > MAX_TEXTO) revert TextoInvalido(0);
        c.revocado = true;
        motivos[id] = motivo;
        delete solicitudesDe[id];
        emit Revocado(id, motivo);
    }

    function _quitarDe(address titular, uint256 id) private {
        uint256[] storage lista = idsDeTitular[titular];
        for (uint256 i = 0; i < lista.length; i++) {
            if (lista[i] == id) {
                lista[i] = lista[lista.length - 1];
                lista.pop();
                return;
            }
        }
    }

    function _existente(uint256 id) private view returns (Certificado storage c) {
        if (id == 0 || id > ultimo) revert NoExiste(id);
        c = certificados[id];
    }

    // ---------- Lectura ----------

    function total() external view returns (uint256) {
        return ultimo;
    }

    function certificado(uint256 id) external view returns (Certificado memory) {
        return _existente(id);
    }

    function motivoRevocacion(uint256 id) external view returns (string memory) {
        _existente(id);
        return motivos[id];
    }

    /// Id del certificado con ese PDF, o 0 si no hay ninguno.
    function porPdf(bytes32 sha256Pdf) external view returns (uint256) {
        return idPorPdf[sha256Pdf];
    }

    function solicitudes(uint256 id) external view returns (Solicitud[] memory) {
        _existente(id);
        return solicitudesDe[id];
    }

    /// Para el panel: de los certificados [desde, desde + cuantos), los que tienen solicitudes abiertas.
    function conSolicitudes(uint256 desde, uint256 cuantos) external view returns (uint256[] memory ids, Solicitud[][] memory lista) {
        if (desde == 0) desde = 1;
        if (cuantos == 0 || desde > ultimo) return (new uint256[](0), new Solicitud[][](0));
        uint256 hasta = desde + cuantos - 1;
        if (hasta > ultimo) hasta = ultimo;
        uint256 n = 0;
        for (uint256 id = desde; id <= hasta; id++) if (solicitudesDe[id].length > 0) n++;
        ids = new uint256[](n);
        lista = new Solicitud[][](n);
        uint256 k = 0;
        for (uint256 id = desde; id <= hasta; id++) {
            if (solicitudesDe[id].length > 0) {
                ids[k] = id;
                lista[k] = solicitudesDe[id];
                k++;
            }
        }
    }

    function deTitular(address titular) external view returns (uint256[] memory) {
        return idsDeTitular[titular];
    }

    /// Certificados [desde, desde + cuantos), con desde ≥ 1.
    function pagina(uint256 desde, uint256 cuantos) external view returns (uint256[] memory ids, Certificado[] memory lista) {
        if (desde == 0) desde = 1;
        if (cuantos == 0 || desde > ultimo) return (new uint256[](0), new Certificado[](0));
        uint256 hasta = desde + cuantos - 1;
        if (hasta > ultimo) hasta = ultimo;
        uint256 n = hasta - desde + 1;
        ids = new uint256[](n);
        lista = new Certificado[](n);
        for (uint256 i = 0; i < n; i++) {
            ids[i] = desde + i;
            lista[i] = certificados[desde + i];
        }
    }
}
