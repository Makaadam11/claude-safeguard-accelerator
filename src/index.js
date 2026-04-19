module.exports = {
  enable: (opts) => require('./commands/enable').run(opts),
  disable: () => require('./commands/disable').run(),
  status: () => require('./commands/status').run(),
  stats: (opts) => require('./commands/stats').run(opts),
  list: (target, opts) => require('./commands/list').run(target, opts),
  diff: () => require('./commands/diff').run(),
  doctor: () => require('./commands/doctor').run(),
  update: () => require('./commands/update').run(),
  rules: require('./rules'),
  merge: require('./settings/merge'),
};
