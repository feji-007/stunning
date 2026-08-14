/**
 * 管理后台 API 聚合路由
 *
 * 挂载于 /api/admin，包含：
 *   /auth      管理员认证
 *   /users     用户管理
 *   /recharge  充值套餐 / 订单管理
 *   /settings  系统配置管理
 *   /video     视频任务管理
 *   /feedback  用户意见反馈管理
 */
const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/users', require('./users'));
router.use('/recharge', require('./recharge'));
router.use('/settings', require('./settings'));
router.use('/video', require('./video'));
router.use('/feedback', require('./feedback'));

module.exports = router;
