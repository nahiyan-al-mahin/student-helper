// Helpers about people: what parts of a user we show, and who may see what.
const db = require('../db');

// Turn a users row into safe JSON (never send password_hash!).
// includePrivate = true only when it is the user's own account.
function publicUser(u, includePrivate = false) {
  const out = {
    id: u.id,
    username: u.username,
    display_name: u.display_name,
    bio: u.bio,
    school: u.school,
    avatar_url: u.avatar_url,
    accent_color: u.accent_color,
    is_private: !!u.is_private,
    created_at: u.created_at,
  };
  if (includePrivate) out.email = u.email;
  return out;
}

// 'none' | 'pending' | 'accepted'
async function followStatus(followerId, followingId) {
  const [[row]] = await db.query(
    'SELECT status FROM follows WHERE follower_id = ? AND following_id = ?', [followerId, followingId]);
  return row ? row.status : 'none';
}

// Can `viewerId` see the routine/progress of `owner`?
// Yes if it's yourself, the profile is public, or you are an accepted follower.
async function canView(viewerId, owner) {
  if (viewerId === owner.id || !owner.is_private) return true;
  return (await followStatus(viewerId, owner.id)) === 'accepted';
}

module.exports = { publicUser, followStatus, canView };
