import fs from 'node:fs';

const database = JSON.parse(fs.readFileSync(new URL('../data/database.json', import.meta.url), 'utf8'));

// Keep this list explicit: the generated browser-readable snapshot must never
// contain the administrator account, password hash, messages, or activity.
const publicPortfolio = {
  profile: database.profile,
  settings: database.settings,
  navigation: database.navigation,
  projects: database.projects,
  skills: database.skills,
  experience: database.experience,
  education: database.education,
  certifications: database.certifications,
  services: database.services,
  testimonials: database.testimonials,
  posts: database.posts,
  media: database.media,
  resumes: database.resumes,
};

const output = new URL('../client/public/portfolio.json', import.meta.url);
fs.mkdirSync(new URL('../client/public/', import.meta.url), { recursive: true });
fs.writeFileSync(output, JSON.stringify({ ok: true, data: publicPortfolio }));
console.log('Generated public portfolio fallback');
