// email → [trainer display name(s)]  — must mirror TRAINER_EMAIL_MAP in both portals
const _map = {
  'sherwin.thiarhia@educare.edu.au':  ['Sherwin Thiarhia'],
  'troy.scott@educare.edu.au':        ['Troy Scott'],
  'maggie@educare.edu.au':            ['Maggie Yu Huang'],
  'kylie.ma@niet.edu.au':             ['Zeyun Ma'],
  'nati.belen@educare.edu.au':        ['Nati Belen'],
  'toriqul.mozumder@educare.edu.au':  ['Toriqul Mozumder'],
  'vijeta@educare.edu.au':            ['Vijeta Srivastava'],
  'alessandro.tavian@educare.edu.au': ['Alessandro Tavian'],
};

function trainersFromEmail(email) {
  return _map[(email || '').toLowerCase()] || [];
}

module.exports = { trainersFromEmail };
