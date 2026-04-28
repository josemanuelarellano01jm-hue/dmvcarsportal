const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const DATA_FILE = path.join(__dirname, 'data', 'tramites.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(path.join(__dirname, 'data'))) fs.mkdirSync(path.join(__dirname, 'data'));
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ tramites: [] }, null, 2));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'doc-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowed.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Solo imagenes permitidas'));
  }
});

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function authAdmin(req, res, next) {
  const password = req.headers['x-admin-password'];
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ success: false, message: 'No autorizado' });
  }
  next();
}

// VERIFICAR TRAMITE
app.post('/api/verify', (req, res) => {
  const { id, servicio } = req.body;

  if (!id || !servicio) {
    return res.status(400).json({
      success: false,
      status: 'error',
      message: 'Debes proporcionar el ID y el servicio'
    });
  }

  const data = readData();
  const idUpper = id.trim().toUpperCase();
  const tramite = data.tramites.find(
    t => t.id.toUpperCase() === idUpper && t.servicio === servicio
  );

  if (!tramite) {
    return res.json({
      success: false,
      status: 'not_found',
      message: 'Tramite no encontrado'
    });
  }

  return res.json({
    success: true,
    status: tramite.estado,
    data: {
      id: tramite.id,
      servicio: tramite.servicio,
      servicioNombre: getServiceName(tramite.servicio),
      estado: tramite.estado,
      estadoTexto: getEstadoTexto(tramite.estado),
      nombreCompleto: tramite.nombreCompleto,
      fechaNacimiento: tramite.fechaNacimiento,
      estadoUSA: tramite.estadoUSA,
      direccion: tramite.direccion || '',
      telefono: tramite.telefono || '',
      email: tramite.email || '',
      fechaCreacion: tramite.fechaCreacion,
      fechaVencimiento: tramite.fechaVencimiento,
      fechaEntrega: tramite.fechaEntrega,
      trackingNumber: tramite.trackingNumber,
      validoEn: tramite.validoEn || 'Los 50 Estados de USA',
      notas: tramite.notas || '',
      documentos: tramite.documentos || []
    }
  });
});

// LOGIN ADMIN
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, token: ADMIN_PASSWORD });
  }
  return res.status(401).json({ success: false, message: 'Contrasena incorrecta' });
});

// LISTAR TRAMITES
app.get('/api/admin/tramites', authAdmin, (req, res) => {
  const data = readData();
  res.json({ success: true, tramites: data.tramites });
});

// CREAR TRAMITE CON FOTOS
app.post('/api/admin/tramites', authAdmin, upload.array('documentos', 10), (req, res) => {
  const { 
    servicio, nombreCompleto, fechaNacimiento, estadoUSA,
    direccion, telefono, email, estado, 
    fechaVencimiento, fechaEntrega, notas, validoEn
  } = req.body;

  if (!servicio || !nombreCompleto || !estado || !fechaNacimiento || !estadoUSA) {
    return res.status(400).json({ 
      success: false, 
      message: 'Faltan campos requeridos' 
    });
  }

  const data = readData();
  const prefix = getServicePrefix(servicio);
  const randomNum = Math.floor(Math.random() * 900000 + 100000);
  const id = `${prefix}-${randomNum}`;

  const documentos = req.files ? req.files.map((file, index) => ({
    nombre: `Documento ${index + 1}`,
    url: `/uploads/${file.filename}`,
    nombreOriginal: file.originalname
  })) : [];

  const nuevoTramite = {
    id,
    servicio,
    nombreCompleto,
    fechaNacimiento,
    estadoUSA,
    direccion: direccion || '',
    telefono: telefono || '',
    email: email || '',
    estado,
    fechaCreacion: new Date().toISOString(),
    fechaVencimiento: fechaVencimiento || null,
    fechaEntrega: fechaEntrega || null,
    trackingNumber: `TRK-${Math.floor(Math.random() * 900000 + 100000)}`,
    validoEn: validoEn || 'Los 50 Estados de USA',
    notas: notas || '',
    documentos
  };

  data.tramites.push(nuevoTramite);
  writeData(data);

  res.json({ success: true, message: 'Tramite creado', tramite: nuevoTramite });
});

// ACTUALIZAR TRAMITE
app.put('/api/admin/tramites/:id', authAdmin, (req, res) => {
  const { id } = req.params;
  const data = readData();
  const index = data.tramites.findIndex(t => t.id === id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'No encontrado' });
  }

  data.tramites[index] = { ...data.tramites[index], ...req.body, id: data.tramites[index].id };
  writeData(data);
  res.json({ success: true, tramite: data.tramites[index] });
});

// ELIMINAR TRAMITE
app.delete('/api/admin/tramites/:id', authAdmin, (req, res) => {
  const { id } = req.params;
  const data = readData();
  const index = data.tramites.findIndex(t => t.id === id);
  
  if (index === -1) {
    return res.status(404).json({ success: false, message: 'No encontrado' });
  }

  const tramite = data.tramites[index];
  if (tramite.documentos && tramite.documentos.length > 0) {
    tramite.documentos.forEach(doc => {
      const filepath = path.join(__dirname, doc.url);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    });
  }

  data.tramites.splice(index, 1);
  writeData(data);
  res.json({ success: true, message: 'Eliminado' });
});

function getServicePrefix(servicio) {
  return { 'seguros': 'INS', 'placas': 'PLT', 'titulos': 'TTL', 'licencias': 'LIC' }[servicio] || 'DMV';
}

function getServiceName(servicio) {
  return {
    'seguros': 'Seguro de Auto',
    'placas': 'Placa Temporal',
    'titulos': 'Titulo Vehicular',
    'licencias': 'Licencia de Conducir'
  }[servicio] || 'Tramite';
}

function getEstadoTexto(estado) {
  return {
    'activo': 'Activo y Vigente',
    'proceso': 'En Proceso',
    'vencido': 'Vencido',
    'cancelado': 'Cancelado'
  }[estado] || estado;
}

app.listen(PORT, () => {
  console.log('');
  console.log('====================================');
  console.log('   DMVCarPortal Server');
  console.log('   Puerto: ' + PORT);
  console.log('   Portal: http://localhost:' + PORT);
  console.log('   Admin:  http://localhost:' + PORT + '/admin.html');
  console.log('   Password: ' + ADMIN_PASSWORD);
  console.log('====================================');
  console.log('');
});