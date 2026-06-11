// Shared review-team data — used by the About page, the per-reviewer pages
// (/reviewers/[slug]/) and the review byline links.
import { slugify } from './taxonomy.js';

export const team = [
  {
    slug: 'holly-woodford',
    initials: 'HW', image: '/images/team/holly.jpg', name: 'Holly Woodford', role: 'Co-Founder & Editor',
    bio: "Holly is a long-time advocate for women in sport. An endurance athlete and self-confessed kit geek, she tests gear in real training conditions and cuts through the hype to find what actually works for women's bodies and lives. Holly built the Women's Sports Standard™ framework and oversees every review published on the site.",
    specialisms: ['Running', 'Trail', 'Triathlon', 'Kit & Gear', 'Technology'],
    instagram: { handle: '@challengehollyberry', url: 'https://instagram.com/challengehollyberry' },
    email: 'holly@womenssportsstore.com',
  },
  {
    slug: 'mel-berry',
    initials: 'MB', image: '/images/team/mel.jpg', name: 'Mel Berry', role: 'Co-Founder & Editor',
    bio: "Mel believes we're all capable of more than we think. Growth comes from listening, adapting, and moving forward with purpose. As a coach her goal is to help athletes unlock their potential, enjoy the journey, and get access to great products that make it even more enjoyable. Mel leads testing across swim and triathlon categories and brings exacting standards to every product she reviews.",
    specialisms: ['Swimming', 'Triathlon', 'Cycling', 'Coaching', 'Equipment', 'Sports Bras'],
    instagram: { handle: '@melberrycoaching', url: 'https://instagram.com/melberrycoaching' },
    email: 'mel@womenssportsstore.com',
  },
  {
    slug: 'gemma-richardson',
    initials: 'GR', image: '/images/team/gemma.jpg', name: 'Gemma Richardson', role: "Women's Health Physio & Pilates Teacher",
    bio: "Gemma is a specialist Women's Health Physiotherapist and Pilates teacher who helps women recover and move with confidence. She puts equipment and wellness products through everyday use, sharing honest insights grounded in clinical experience and real life. Her specialist background means she spots what other reviewers miss — how a product actually performs for women's bodies under real conditions.",
    specialisms: ['Running', 'Gym', 'Pilates', 'Wellness', 'Recovery'],
    instagram: { handle: '@her_physioandpilates', url: 'https://instagram.com/her_physioandpilates' },
    email: '',
  },
];

// A review's `tested_by` is free text, often "Name — role/extra". Pull the
// leading name (before an en/em dash or " - ") and match it to a team member.
export function findReviewer(testedBy) {
  const lead = String(testedBy || '').split(/\s[—–-]\s/)[0].trim().toLowerCase();
  if (!lead) return null;
  return team.find((m) => m.name.toLowerCase() === lead) || null;
}

export const igIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.43.36 1.06.41 2.23.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.43.16-1.06.36-2.23.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.23-.41a3.72 3.72 0 01-1.38-.9 3.72 3.72 0 01-.9-1.38c-.16-.43-.36-1.06-.41-2.23C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.43-.16 1.06-.36 2.23-.41C8.42 2.17 8.8 2.16 12 2.16zm0 1.94c-3.14 0-3.51.01-4.75.07-1.15.05-1.77.24-2.18.4-.55.21-.94.47-1.35.88-.41.41-.67.8-.88 1.35-.16.41-.35 1.03-.4 2.18-.06 1.24-.07 1.61-.07 4.75s.01 3.51.07 4.75c.05 1.15.24 1.77.4 2.18.21.55.47.94.88 1.35.41.41.8.67 1.35.88.41.16 1.03.35 2.18.4 1.24.06 1.61.07 4.75.07s3.51-.01 4.75-.07c1.15-.05 1.77-.24 2.18-.4.55-.21.94-.47 1.35-.88.41-.41.67-.8.88-1.35.16-.41.35-1.03.4-2.18.06-1.24.07-1.61.07-4.75s-.01-3.51-.07-4.75c-.05-1.15-.24-1.77-.4-2.18a3.66 3.66 0 00-.88-1.35 3.66 3.66 0 00-1.35-.88c-.41-.16-1.03-.35-2.18-.4-1.24-.06-1.61-.07-4.75-.07zm0 3.3a4.6 4.6 0 110 9.2 4.6 4.6 0 010-9.2zm0 7.59a2.99 2.99 0 100-5.98 2.99 2.99 0 000 5.98zm5.85-7.81a1.08 1.08 0 11-2.15 0 1.08 1.08 0 012.15 0z"/></svg>';
