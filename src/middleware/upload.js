const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('Multer destination called for file:', file.originalname);
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-randomnumber-originalname
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    const filename = `issue-${uniqueSuffix}${ext}`;
    console.log('Multer filename:', filename);
    cb(null, filename);
  },
});

// File filter - only allow images
const fileFilter = (req, file, cb) => {
  console.log('File filter called:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
  });
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    console.log('File passed filter');
    return cb(null, true);
  } else {
    console.log('File rejected by filter');
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: fileFilter,
});

// Wrap multer to log when it's invoked
const wrappedUpload = {
  single: (fieldName) => {
    return (req, res, next) => {
      console.log(
        'Multer middleware invoked for field:',
        fieldName,
        'Content-Type:',
        req.headers['content-type']
      );
      return upload.single(fieldName)(req, res, (err) => {
        if (err) {
          console.log('Multer error:', err.message);
        } else {
          console.log(
            'Multer success, req.file:',
            req.file
              ? { fieldname: req.file.fieldname, filename: req.file.filename }
              : 'undefined'
          );
        }
        next(err);
      });
    };
  },
};

module.exports = wrappedUpload;
