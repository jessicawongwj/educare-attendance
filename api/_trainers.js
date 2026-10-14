// email → [trainer display name(s)]  — must mirror TRAINER_EMAIL_MAP in both portals
const _map = {
  'troy.scott@educare.edu.au':        ['Troy Scott'],
  'kylie.ma@niet.edu.au':             ['Zeyun Ma'],
  'nati.belen@educare.edu.au':        ['Nati Belen'],
  'toriqul.mozumder@educare.edu.au':  ['Toriqul Mozumder'],
  'vijeta@educare.edu.au':            ['Vijeta Srivastava'],
  // "Sandro" is Alessandro Tavian's own nickname, not a separate trainer/login.
  'alessandro.tavian@educare.edu.au': ['Alessandro Tavian'],
  'malcolm.lange@educare.edu.au':     ['Malcolm Lange'],
  'rama.b@educare.edu.au':            ['Rama'],
  // Charlton Brown trainers who now also teach Educare classes (Oct 2026 timetable)
  'carol.ly@charltonbrown.edu.au':    ['Carol Ly'],
  'nicole@charltonbrown.edu.au':      ['Nicole Hicks'],
  // Maggie Yu Huang and Sherwin Thiarhia left Educare (Oct 2026) — access removed.
  // Charlton Brown / NIET sign-in addresses for people who teach for both — same person as
  // the Educare address above, so either account works in this portal too.
  'nati.belen@charltonbrown.edu.au':      ['Nati Belen'],
  'toriqul.mozumder@charltonbrown.edu.au':['Toriqul Mozumder'],
};

function trainersFromEmail(email) {
  return _map[(email || '').toLowerCase()] || [];
}

module.exports = { trainersFromEmail };
