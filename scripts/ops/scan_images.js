const collections = ['pages', 'posts', 'members', 'equipment', 'settings', 'media', 'activities'];
collections.forEach(col => {
  const docs = db[col].find().toArray();
  docs.forEach(d => {
    const s = JSON.stringify(d);
    const regex = /\/api\/media-files\/[^"'\s]+/g;
    let match;
    while ((match = regex.exec(s)) !== null) {
      print(col + ' [' + (d.slug || d.name || d.id) + ']: ' + match[0]);
    }
    const regexHttp = /http:\/\/(localhost|127\.0\.0\.1|100\.)[^"'\s]+/g;
    while ((match = regexHttp.exec(s)) !== null) {
      print('[WARN HTTP] ' + col + ' [' + (d.slug || d.name || d.id) + ']: ' + match[0]);
    }
  });
});
