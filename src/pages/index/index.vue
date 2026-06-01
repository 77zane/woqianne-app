<template>
  <view class="app-container">
    <!-- 状态栏占位 -->
    <view :style="{ height: statusBarHeight + 'px' }"></view>

    <!-- V2：同步状态 Toast -->
    <view v-if="syncToastVisible" class="sync-toast" :class="syncToastType" @tap="syncToastType === 'error' ? doSync() : null">
      <text class="sync-toast-text">{{ syncToastText }}</text>
    </view>

    <!-- 顶部概览 -->
    <view class="overview">
      <view class="overview-row">
        <text class="overview-month" @tap="showMonthPicker">{{ currentMonth }} ▾</text>
      </view>
      <view class="overview-amounts">
        <text class="overview-tab" :class="{ active: statsMode === 'expense' }" @tap="toggleStatsMode('expense')">支出 ¥{{ formatMoney(monthExpense) }}</text>
        <text class="divider">·</text>
        <text class="overview-tab" :class="{ active: statsMode === 'income' }" @tap="toggleStatsMode('income')">收入 ¥{{ formatMoney(monthIncome) }}</text>
        <text class="divider">·</text>
        <text class="overview-tab overview-tab-static">结余 ¥{{ formatMoney(monthBalance) }}</text>
      </view>

      <!-- 统计面板 -->
      <view v-if="statsExpanded" class="stats-panel">
        <view v-for="(stat, idx) in currentStats" :key="idx" class="stat-row">
          <text class="stat-note">{{ stat.note }}</text>
          <text class="stat-amount">¥{{ formatMoney(stat.amount) }}</text>
          <text class="stat-percent">{{ stat.percent }}%</text>
          <view class="stat-bar-bg">
            <view class="stat-bar-fill" :style="{ width: stat.percent + '%' }"></view>
          </view>
        </view>
      </view>
    </view>

    <!-- 流水列表 -->
    <view class="transaction-list">
      <view v-for="(items, date) in groupedTransactions" :key="date" class="date-group">
        <view class="date-label">{{ formatDateLabel(date) }}</view>
        <view
          v-for="t in items"
          :key="t.id"
          class="transaction-row"
          @tap="startEdit(t)"
        >
          <text class="t-note">{{ t.note || '(无备注)' }}</text>
          <text :class="['t-amount', t.amount > 0 ? 'income' : 'expense']">
            {{ t.amount > 0 ? '+' : '' }}¥{{ formatMoney(t.amount) }}
          </text>
        </view>
      </view>

      <!-- 空状态 -->
      <view v-if="transactions.length === 0" class="empty-state">
        <text class="empty-icon">📝</text>
        <text class="empty-text">还没有记录</text>
        <text class="empty-hint">在下方输入金额开始记账</text>
      </view>

      <!-- 底部占位，避免被输入栏遮挡 -->
      <view style="height: 420rpx;"></view>
    </view>

    <!-- 删除确认弹窗 -->
    <view v-if="deletingId" class="modal-overlay" @tap.self="cancelDelete">
      <view class="modal-card" @tap.stop>
        <text class="modal-title">确认删除</text>
        <text class="modal-body">{{ deletingItemNote ? '「' + deletingItemNote + '」' : '' }}删除后无法恢复，确定吗？</text>
        <view class="modal-actions">
          <view class="modal-btn cancel" @tap="cancelDelete"><text>取消</text></view>
          <view class="modal-btn confirm-delete" @tap="doDelete(deletingId)"><text>删除</text></view>
        </view>
      </view>
    </view>

    <!-- 标签删除确认弹窗 -->
    <view v-if="deletingTag" class="modal-overlay" @tap.self="cancelRemoveTag">
      <view class="modal-card" @tap.stop>
        <text class="modal-title">删除标签</text>
        <text class="modal-body">确定要删除标签「{{ deletingTag }}」吗？删除后不再显示在标签栏。</text>
        <view class="modal-actions">
          <view class="modal-btn cancel" @tap="cancelRemoveTag"><text>取消</text></view>
          <view class="modal-btn confirm-delete" @tap="removeTag(deletingTag)"><text>删除</text></view>
        </view>
      </view>
    </view>

    <!-- 底部输入栏 -->
    <view class="input-bar">
      <!-- 第一行：日期选择 + 金额输入 -->
      <view class="input-row">
        <!-- 日期选择 -->
        <view class="date-picker" @tap="openDatePicker">
          <text class="date-text">{{ dateDisplayText }}</text>
          <text class="date-arrow">▾</text>
        </view>
        <!-- 金额输入 -->
        <view class="amount-input-wrapper">
          <text class="yuan-sign">¥</text>
          <input
            class="amount-input"
            v-model="inputAmount"
            type="text"
            inputmode="decimal"
            placeholder="-18 支出  +8500 收入"
            :focus="amountFocus"
            confirm-type="done"
            @confirm="onAmountConfirm"
          />
        </view>
      </view>

      <!-- 第二行：备注输入 -->
      <view class="note-row">
        <input
          class="note-input"
          v-model="inputNote"
          type="text"
          placeholder="午餐、地铁…"
          maxlength="50"
        />
      </view>

      <!-- 第三行：标签栏 -->
      <view class="tags-row-wrapper">
        <view class="tags-row">
          <view
            v-for="(tag, idx) in displayTags"
            :key="idx"
            class="tag-btn"
            :class="{ active: inputNote === tag }"
            @tap="fillNote(tag)"
            @longpress="onTagLongPress(tag)"
          >
            <text>{{ tag }}</text>
          </view>
          <!-- 下拉展开按钮 -->
          <view v-if="tags.length > 5" class="tag-expand-btn" @tap="toggleTagsPanel">
            <text>{{ tagsPanelVisible ? '收起' : '更多' }}</text>
            <text class="expand-arrow">{{ tagsPanelVisible ? '▴' : '▾' }}</text>
          </view>
        </view>
      </view>

      <!-- 标签抽屉面板 -->
      <view v-if="tagsPanelVisible" class="tags-panel-overlay" @tap="toggleTagsPanel">
        <view class="tags-panel" @tap.stop>
          <view class="tags-panel-header">
            <text class="tags-panel-title">选择备注</text>
            <text class="tags-panel-close" @tap="toggleTagsPanel">完成</text>
          </view>
          <view class="tags-panel-content">
            <view
              v-for="(tag, idx) in sortedTags"
              :key="idx"
              class="tag-btn-large"
              :class="{ active: inputNote === tag }"
              @tap="fillNoteAndClose(tag)"
              @longpress="onTagLongPressInPanel(tag)"
            >
              <text>{{ tag }}</text>
              <text class="tag-count">{{ getTagCount(tag) }}次</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 第四行：操作按钮 -->
      <!-- 编辑模式：取消+保存，下方删除 -->
      <view v-if="editingId" class="edit-actions">
        <view class="action-row">
          <view class="action-btn cancel-btn" @tap="cancelEdit">
            <text>取消</text>
          </view>
          <view class="action-btn save-btn" :class="{ disabled: !canSave }" @tap="saveTransaction">
            <text>保存</text>
          </view>
        </view>
        <view class="delete-link" @tap="onEditDelete">
          <text>删除此记录</text>
        </view>
      </view>
      <!-- 新建模式：记一笔按钮 -->
      <view v-else class="save-btn-full" :class="{ disabled: !canSave }" @tap="saveTransaction">
        <text>记一笔</text>
      </view>
    </view>

    <!-- 月份选择弹窗 -->
    <view v-if="monthPickerVisible" class="modal-overlay" @tap.self="closeMonthPicker">
      <view class="month-picker-card" @tap.stop>
        <text class="modal-title">选择月份</text>
        <view class="month-picker-grid">
          <view
            v-for="m in monthOptions"
            :key="m.value"
            class="month-option"
            :class="{ active: selectedMonth === m.value }"
            @tap="selectMonth(m.value)"
          >
            <text>{{ m.label }}</text>
          </view>
        </view>
        <!-- V2：已登录时显示账户信息 -->
        <view v-if="isLoggedIn" class="account-section">
          <view class="account-divider"></view>
          <view class="account-row">
            <text class="account-email">📧 {{ userEmail }}</text>
            <view class="logout-btn" @tap="showLogoutConfirm">
              <text>退出</text>
            </view>
          </view>
        </view>
        <view class="modal-actions">
          <view class="modal-btn cancel" @tap="closeMonthPicker"><text>取消</text></view>
        </view>
      </view>
    </view>

    <!-- V2：登录弹窗 -->
    <view v-if="loginModalVisible" class="modal-overlay" @tap.self="closeLoginModal">
      <view class="modal-card" @tap.stop>
        <view class="modal-title-row">
          <text class="modal-title">登录即注册</text>
          <text class="modal-close" @tap="closeLoginModal">✕</text>
        </view>

        <!-- 邮箱输入 -->
        <view class="login-field">
          <text class="field-icon">📧</text>
          <input
            class="login-input"
            v-model="loginEmail"
            type="text"
            placeholder="输入邮箱"
            :disabled="loggingIn"
          />
        </view>

        <!-- 验证码输入 -->
        <view class="login-field">
          <text class="field-icon">🔢</text>
          <input
            class="login-input code-input"
            v-model="loginCode"
            type="number"
            maxlength="6"
            placeholder="验证码"
            :disabled="loggingIn"
            @confirm="handleLogin"
          />
          <view
            class="send-code-btn"
            :class="{ counting: codeCountdown > 0 }"
            @tap="sendVerificationCode"
          >
            <text v-if="codeCountdown === 0">发送验证码</text>
            <text v-else>{{ codeCountdown }}s</text>
          </view>
        </view>

        <!-- 登录按钮 -->
        <view
          class="login-btn"
          :class="{ disabled: loggingIn || !loginEmail || loginCode.length !== 6 }"
          @tap="handleLogin"
        >
          <text v-if="loggingIn">登录中...</text>
          <text v-else>登录</text>
        </view>

        <text class="login-hint">⚠ 请牢记邮箱</text>
      </view>
    </view>

    <!-- V2：退出登录确认弹窗 -->
    <view v-if="logoutConfirmVisible" class="modal-overlay" @tap.self="hideLogoutConfirm">
      <view class="modal-card" @tap.stop>
        <text class="modal-title">退出登录</text>
        <text class="modal-body">退出后云端数据仍保留，本地数据不受影响。</text>
        <view class="modal-actions">
          <view class="modal-btn cancel" @tap="hideLogoutConfirm">
            <text>取消</text>
          </view>
          <view class="modal-btn confirm-delete" @tap="doLogout">
            <text>退出登录</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import * as storage from '../../utils/storage.js'
import * as auth from '../../utils/auth.js'
import * as api from '../../utils/api.js'
import * as sync from '../../utils/sync.js'

export default {
  data() {
    const today = new Date()
    const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    return {
      statusBarHeight: 0,
      today,
      formatDate,
      transactions: [],    // 从 storage 加载
      tags: [],            // 从 storage 加载
      tagUsageCount: {},   // 从 storage 加载或自动计算
      inputAmount: '',
      inputNote: '',
      selectedDate: formatDate(today),  // 选中的日期，默认今天，保存后不重置
      statsExpanded: false,
      statsMode: null,  // 'expense' | 'income' | 'balance' | null（初始无选中）
      editingId: null,
      deletingId: null,
      deletingItemNote: '',
      deletingTag: null,
      amountFocus: false,
      tagsPanelVisible: false,
      selectedMonth: formatDate(today).substring(0, 7),  // YYYY-MM
      monthPickerVisible: false,

      // ===== V2 新增：登录 & 同步 =====
      // 登录状态（响应式，驱动 isLoggedIn computed）
      _loginState: false,

      // 登录弹窗
      loginModalVisible: false,
      loginEmail: '',
      loginCode: '',
      sendingCode: false,
      codeCountdown: 0,
      loggingIn: false,

      // 同步状态 toast
      syncToastVisible: false,
      syncToastType: '',   // 'sync' | 'success' | 'error'
      syncToastText: '',

      // 退出登录确认弹窗
      logoutConfirmVisible: false,

      // 下拉刷新状态
      refresherTriggered: false,
    }
  },
  computed: {
    // 显示在第一行的标签（最多5个）
    displayTags() {
      return this.sortedTags.slice(0, 5)
    },
    // 按使用频率排序的标签
    sortedTags() {
      return [...this.tags].sort((a, b) => {
        const countA = this.tagUsageCount[a] || 0
        const countB = this.tagUsageCount[b] || 0
        return countB - countA
      })
    },
    currentMonth() {
      const [y, m] = this.selectedMonth.split('-')
      return `${y}年${parseInt(m)}月`
    },
    // 当前选中月份的交易记录
    monthTransactions() {
      return this.transactions.filter(t => t.date.startsWith(this.selectedMonth))
    },
    monthExpense() {
      return this.monthTransactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0)
    },
    monthIncome() {
      return this.monthTransactions
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0)
    },
    monthBalance() {
      return Math.max(0, this.monthIncome - this.monthExpense)
    },
    groupedTransactions() {
      const groups = {}
      const filtered = this.monthTransactions
      const sorted = [...filtered].sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date)
        return b.id - a.id
      })
      for (const t of sorted) {
        if (!groups[t.date]) groups[t.date] = []
        groups[t.date].push(t)
      }
      return groups
    },
    // 月份选择器选项：当前月 + 有记录的月份
    monthOptions() {
      const options = []
      const now = new Date()
      const currentYear = now.getFullYear()
      const currentMonthNum = now.getMonth() + 1
      const currentMonthStr = `${currentYear}-${String(currentMonthNum).padStart(2, '0')}`

      // 收集所有有记录的月份
      const existingMonths = new Set()
      this.transactions.forEach(t => {
        existingMonths.add(t.date.substring(0, 7))
      })

      // 添加当前月
      existingMonths.add(currentMonthStr)

      // 转换为选项格式
      existingMonths.forEach(ym => {
        const [y, m] = ym.split('-')
        options.push({
          value: ym,
          label: `${y}年${parseInt(m)}月`
        })
      })

      // 按时间倒序
      options.sort((a, b) => b.value.localeCompare(a.value))
      return options
    },
    // 当前统计面板数据
    currentStats() {
      if (this.statsMode === 'expense') return this.expenseStats
      if (this.statsMode === 'income') return this.incomeStats
      return []
    },
    expenseStats() {
      const map = {}
      this.monthTransactions.filter(t => t.amount < 0).forEach(t => {
        const key = t.note || '(无备注)'
        if (!map[key]) map[key] = 0
        map[key] += Math.abs(t.amount)
      })
      return Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .map(([note, amount]) => ({
          note,
          amount,
          percent: this.monthExpense > 0 ? (amount / this.monthExpense * 100).toFixed(1) : 0
        }))
    },
    incomeStats() {
      const map = {}
      this.monthTransactions.filter(t => t.amount > 0).forEach(t => {
        const key = t.note || '(无备注)'
        if (!map[key]) map[key] = 0
        map[key] += t.amount
      })
      return Object.entries(map)
        .sort((a, b) => b[1] - a[1])
        .map(([note, amount]) => ({
          note,
          amount,
          percent: this.monthIncome > 0 ? (amount / this.monthIncome * 100).toFixed(1) : 0
        }))
    },
    // 日期显示文本
    dateDisplayText() {
      const todayStr = this.formatDate(this.today)
      const yesterdayStr = this.formatDate(new Date(this.today.getTime() - 86400000))

      if (this.selectedDate === todayStr) return '今天'
      if (this.selectedDate === yesterdayStr) return '昨天'

      const d = new Date(this.selectedDate)
      const thisYear = this.today.getFullYear()
      if (d.getFullYear() === thisYear) {
        return `${d.getMonth() + 1}月${d.getDate()}日`
      }
      return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
    },
    // 是否可以保存
    canSave() {
      const raw = this.inputAmount.trim()
      if (!raw) return false
      const num = parseFloat(raw)
      if (isNaN(num) || num === 0) return false
      return true
    },

    // ===== V2 新增 =====
    // 是否已登录（由 _loginState 驱动，确保响应式）
    isLoggedIn() {
      return this._loginState
    },
    // 当前登录邮箱
    userEmail() {
      return auth.getUserEmail()
    },
  },
  onLoad() {
    const sysInfo = uni.getSystemInfoSync()
    this.statusBarHeight = sysInfo.statusBarHeight || 0

    // 从本地存储加载数据
    this.transactions = storage.getTransactions()
    this.tags = storage.getTags()
    this.tagUsageCount = storage.getTagUsageCount()

    // V2：响应式登录状态，从已有 token 初始化
    this._loginState = !!auth.getToken()
  },
  methods: {
    formatMoney(val) {
      const abs = Math.abs(val)
      return abs >= 10000 ? (abs / 10000).toFixed(1) + 'w' : abs.toFixed(abs % 1 === 0 ? 0 : 2)
    },
    formatDateLabel(dateStr) {
      const d = new Date(dateStr)
      const todayStr = this.formatDate(this.today)
      const yesterdayStr = this.formatDate(new Date(this.today.getTime() - 86400000))
      if (dateStr === todayStr) return '今天'
      if (dateStr === yesterdayStr) return '昨天'
      return `${d.getMonth() + 1}月${d.getDate()}日`
    },
    toggleStats() {
      this.statsExpanded = !this.statsExpanded
    },
    toggleStatsMode(mode) {
      if (this.statsMode === mode && this.statsExpanded) {
        // 点击已选中的标签 → 收起面板，恢复初始状态
        this.statsExpanded = false
        this.statsMode = null
      } else {
        this.statsMode = mode
        this.statsExpanded = true
      }
    },
    showMonthPicker() {
      this.monthPickerVisible = true
      // 切换月份后收起统计面板
      this.statsExpanded = false
      this.statsMode = null
    },
    closeMonthPicker() {
      this.monthPickerVisible = false
    },
    selectMonth(value) {
      this.selectedMonth = value
      this.monthPickerVisible = false
      // 切换月份后收起统计面板
      this.statsExpanded = false
      this.statsMode = null
      // 同步日期到该月
      const [y, m] = value.split('-')
      const now = new Date()
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      if (value === currentMonth) {
        this.selectedDate = this.formatDate(now)
      } else {
        const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate()
        this.selectedDate = `${y}-${m}-${String(lastDay).padStart(2, '0')}`
      }
    },
    onItemLongPress(item) {
      this.deletingId = item.id
      this.deletingItemNote = item.note || ''
    },
    // 编辑模式下点击删除
    onEditDelete() {
      this.deletingId = this.editingId
      this.deletingItemNote = this.inputNote || ''
    },
    fillNote(note) {
      this.inputNote = note
    },
    fillNoteAndClose(note) {
      this.inputNote = note
      this.tagsPanelVisible = false
    },
    toggleTagsPanel() {
      this.tagsPanelVisible = !this.tagsPanelVisible
    },
    // 标签面板内长按删除
    onTagLongPressInPanel(tag) {
      this.deletingTag = tag
    },
    // 金额键盘点击"下一步"/回车 → 收起键盘，回到主界面
    onAmountConfirm() {
      // 收起键盘：让金额输入框失去焦点
      this.amountFocus = false
    },
    getTagCount(tag) {
      return this.tagUsageCount[tag] || 0
    },
    // 显示日期选择器 - 直接弹出，不经过 ActionSheet 中转
    openDatePicker() {
      // #ifdef APP-PLUS
      plus.nativeUI.pickDate((e) => {
        const d = e.date
        const picked = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        this.selectedDate = picked
        this.selectedMonth = picked.substring(0, 7)
      }, () => {
        // 取消
      }, {
        title: '选择日期',
        date: new Date(this.selectedDate)
      })
      // #endif
      // #ifdef H5
      const input = document.createElement('input')
      input.type = 'date'
      input.value = this.selectedDate
      input.onchange = (e) => {
        if (e.target.value) {
          this.selectedDate = e.target.value
          this.selectedMonth = e.target.value.substring(0, 7)
        }
      }
      input.click()
      // #endif
    },
    saveTransaction() {
      if (!this.canSave) return

      const raw = this.inputAmount.trim()
      let num = parseFloat(raw)

      // 无符号默认为支出（负数）
      if (num > 0 && !raw.startsWith('+') && !raw.startsWith('-')) {
        num = -num
      }

      if (this.editingId) {
        storage.updateTransaction(this.editingId, {
          amount: num,
          note: this.inputNote,
          date: this.selectedDate
        })
        this.editingId = null
      } else {
        const txn = {
          id: storage.getNextId(),
          amount: num,
          note: this.inputNote,
          date: this.selectedDate
        }
        storage.addTransaction(txn)
      }

      // 备注不为空时自动加入标签
      if (this.inputNote && !this.tags.includes(this.inputNote)) {
        this.tags.push(this.inputNote)
        storage.saveTags(this.tags)
      }

      // 持久化标签使用次数
      if (this.inputNote) {
        storage.incrementTagUsage(this.inputNote)
        this.tagUsageCount = storage.getTagUsageCount()
      }

      // 刷新本地数据
      this.transactions = storage.getTransactions()

      // 清空输入框，但不清空日期
      this.inputAmount = ''
      this.inputNote = ''

      // 自动切换到记录所在月份
      this.selectedMonth = this.selectedDate.substring(0, 7)

      // 确保页面归位
      uni.pageScrollTo({ scrollTop: 0, duration: 0 })

      // V2：自动同步到云端
      if (this.isLoggedIn) {
        sync.syncUpload()
      }
    },
    startEdit(item) {
      this.editingId = item.id
      // 正数显示 "+" 前缀，避免保存时被识别为负数
      this.inputAmount = item.amount > 0 ? '+' + item.amount : item.amount.toString()
      this.inputNote = item.note
      this.selectedDate = item.date
      // 不自动聚焦，避免键盘弹出导致页面偏移
    },
    doDelete(id) {
      storage.deleteTransaction(id)
      this.transactions = storage.getTransactions()
      this.deletingId = null
      this.deletingItemNote = ''
      // 如果删除的是正在编辑的记录，退出编辑模式
      if (this.editingId === id) {
        this.editingId = null
        this.inputAmount = ''
        this.inputNote = ''
        this.selectedDate = this.formatDate(this.today)
      }

      // V2：自动同步删除到云端
      if (this.isLoggedIn) {
        sync.syncUpload()
      }
    },
    cancelDelete() {
      this.deletingId = null
      this.deletingItemNote = ''
    },
    cancelEdit() {
      this.editingId = null
      this.inputAmount = ''
      this.inputNote = ''
      // 取消编辑时，日期重置为今天
      this.selectedDate = this.formatDate(this.today)
      // 确保页面归位
      uni.pageScrollTo({ scrollTop: 0, duration: 0 })
    },
    onTagLongPress(tag) {
      this.deletingTag = tag
    },
    removeTag(tag) {
      this.tags = storage.removeTag(tag)
      this.deletingTag = null
    },
    cancelRemoveTag() {
      this.deletingTag = null
    },

    // ===== V2 新增：登录 & 同步方法 =====

    /** 下拉处理入口 */
    handlePullDown() {
      this.refresherTriggered = false
      if (this.isLoggedIn) {
        this.doSync()
      } else {
        this.showLoginModal()
      }
    },

    /** 显示登录弹窗 */
    showLoginModal() {
      this.loginEmail = ''
      this.loginCode = ''
      this.codeCountdown = 0
      this.loggingIn = false
      this.loginModalVisible = true
    },

    /** 关闭登录弹窗 */
    closeLoginModal() {
      this.loginModalVisible = false
      this.loginEmail = ''
      this.loginCode = ''
      this.codeCountdown = 0
    },

    /** 发送验证码 */
    async sendVerificationCode() {
      const email = this.loginEmail.trim()
      if (!email) {
        uni.showToast({ title: '请输入邮箱', icon: 'none' })
        return
      }
      // 基本格式校验
      if (!email.includes('@') || !email.includes('.')) {
        uni.showToast({ title: '邮箱格式不正确', icon: 'none' })
        return
      }

      if (this.codeCountdown > 0) return

      this.sendingCode = true
      try {
        await api.sendCode(email)
        uni.showToast({ title: '验证码已发送', icon: 'success' })
        this.startCodeCountdown()
      } catch (e) {
        uni.showToast({ title: e.message || '发送失败', icon: 'none' })
      } finally {
        this.sendingCode = false
      }
    },

    /** 启动 60 秒倒计时 */
    startCodeCountdown() {
      this.codeCountdown = 60
      const timer = setInterval(() => {
        this.codeCountdown--
        if (this.codeCountdown <= 0) {
          clearInterval(timer)
        }
      }, 1000)
    },

    /** 登录 */
    async handleLogin() {
      const email = this.loginEmail.trim()
      const code = this.loginCode.trim()
      if (!email || code.length !== 6) return

      this.loggingIn = true
      try {
        const result = await api.login(email, code)
        auth.saveToken(result.token)
        auth.saveUserEmail(email)

        // V2：立即更新响应式状态
        this._loginState = true

        this.loginModalVisible = false
        this.loginEmail = ''
        this.loginCode = ''

        // 首次登录 → 自动合并
        if (result.isNewUser) {
          await sync.mergeOnFirstLogin()
        } else {
          await sync.doFullSync()
        }

        // 刷新页面数据
        this.transactions = storage.getTransactions()
        this.tags = storage.getTags()
        this.tagUsageCount = storage.getTagUsageCount()

        this.showSyncToast('success', '✓ 登录成功')
      } catch (e) {
        uni.showToast({ title: e.message || '登录失败', icon: 'none' })
      } finally {
        this.loggingIn = false
      }
    },

    /** 执行同步 */
    async doSync() {
      this.showSyncToast('sync', '↻ 同步中...')
      const result = await sync.doFullSync()
      if (result.success) {
        // 刷新页面数据
        this.transactions = storage.getTransactions()
        this.tags = storage.getTags()
        this.tagUsageCount = storage.getTagUsageCount()
        this.showSyncToast('success', '✓ 已同步')
      } else {
        // Token 无效 → 清除旧 token，弹出登录框
        if (result.error && result.error.includes('未登录')) {
          auth.logout()
          this._loginState = false
          this.showSyncToast('error', '⚠ 登录已过期，请重新登录')
          setTimeout(() => {
            this.syncToastVisible = false
            this.showLoginModal()
          }, 1500)
        } else {
          this.showSyncToast('error', '⚠ ' + (result.error || '同步失败'))
        }
      }
    },

    /** 显示同步 toast */
    showSyncToast(type, text) {
      this.syncToastType = type
      this.syncToastText = text
      this.syncToastVisible = true

      // 自动消失
      const duration = type === 'error' ? 2000 : 1500
      if (this._syncToastTimer) clearTimeout(this._syncToastTimer)
      this._syncToastTimer = setTimeout(() => {
        this.syncToastVisible = false
      }, duration)
    },

    /** 显示退出登录确认弹窗 */
    showLogoutConfirm() {
      this.logoutConfirmVisible = true
    },

    /** 关闭退出登录确认弹窗 */
    hideLogoutConfirm() {
      this.logoutConfirmVisible = false
    },

    /** 执行退出登录 */
    doLogout() {
      auth.logout()
      this._loginState = false
      this.logoutConfirmVisible = false
      this.monthPickerVisible = false
      this.syncToastVisible = false
    },
  },

  // ===== V2 新增：下拉刷新生命周期 =====
  onPullDownRefresh() {
    this.handlePullDown()
    uni.stopPullDownRefresh()
  },
}
</script>

<style scoped>
.app-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--bg);
}

/* ========== 顶部概览 ========== */
.overview {
  flex-shrink: 0;
  background: var(--glass-bg);
  backdrop-filter: var(--blur);
  -webkit-backdrop-filter: var(--blur);
  padding: 20rpx 32rpx 24rpx;
  border-bottom: 1px solid var(--border);
}

.overview-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14rpx;
}

.overview-month {
  font-size: 38rpx;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.3px;
}

.overview-amounts {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
  flex-wrap: wrap;
}

.overview-tab {
  font-size: 26rpx;
  font-weight: 500;
  color: var(--text-muted);
  padding: 6rpx 12rpx;
  border-radius: 12rpx;
  transition: all 0.2s ease;
}

.overview-tab.active {
  color: var(--text-primary);
  background-color: var(--accent-light);
}

.overview-tab-static {
  cursor: default;
}

.divider {
  font-size: 22rpx;
  color: var(--text-muted);
  opacity: 0.5;
  margin: 0 2rpx;
}

/* 统计面板 */
.stats-panel {
  margin-top: 18rpx;
  padding-top: 18rpx;
  border-top: 1px solid var(--border);
}

.stat-row {
  display: flex;
  align-items: center;
  margin-bottom: 14rpx;
}

.stat-note {
  width: 140rpx;
  font-size: 26rpx;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-amount {
  width: 120rpx;
  font-size: 26rpx;
  color: var(--text-secondary);
  text-align: right;
  margin-right: 10rpx;
}

.stat-percent {
  width: 72rpx;
  font-size: 24rpx;
  color: var(--text-muted);
  margin-right: 12rpx;
}

.stat-bar-bg {
  flex: 1;
  height: 8rpx;
  background-color: rgba(0, 0, 0, 0.05);
  border-radius: 4rpx;
  overflow: hidden;
}

.stat-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #73C7A8, #98D8C8);
  border-radius: 4rpx;
}

/* 月份选择器 */
.month-picker-card {
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: var(--blur);
  -webkit-backdrop-filter: var(--blur);
  border-radius: 32rpx;
  padding: 44rpx;
  width: 640rpx;
  max-height: 70vh;
  box-shadow: 0 20rpx 80rpx rgba(0, 0, 0, 0.12);
}

.month-picker-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  max-height: 50vh;
  overflow-y: auto;
  margin: 24rpx 0;
}

.month-option {
  padding: 16rpx 28rpx;
  border-radius: 20rpx;
  background-color: var(--input-bg);
  font-size: 28rpx;
  color: var(--text-primary);
}

.month-option.active {
  background-color: var(--accent-light);
  color: var(--accent-dark);
  font-weight: 600;
}

/* ========== 流水列表 ========== */
.transaction-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 16rpx;
}

.date-group {
  margin-top: 8rpx;
}

.date-label {
  font-size: 24rpx;
  color: var(--text-muted);
  padding: 18rpx 16rpx 10rpx;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.transaction-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 28rpx 24rpx;
  margin-bottom: 4rpx;
  background: var(--card-bg);
  backdrop-filter: var(--blur);
  -webkit-backdrop-filter: var(--blur);
  border-radius: 20rpx;
}

.transaction-row:active {
  background: rgba(255, 255, 255, 0.9);
  transform: scale(0.98);
}

.t-note {
  font-size: 30rpx;
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 20rpx;
}

.t-amount {
  font-size: 32rpx;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.t-amount.expense {
  color: var(--expense);
}

.t-amount.income {
  color: var(--income);
}

/* ========== 空状态 ========== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 120rpx 40rpx;
}

.empty-icon {
  font-size: 96rpx;
  margin-bottom: 24rpx;
}

.empty-text {
  font-size: 32rpx;
  color: var(--text-secondary);
  margin-bottom: 8rpx;
}

.empty-hint {
  font-size: 26rpx;
  color: var(--text-muted);
}

/* ========== 弹窗 ========== */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal-card {
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: var(--blur);
  -webkit-backdrop-filter: var(--blur);
  border-radius: 32rpx;
  padding: 48rpx;
  width: 600rpx;
  box-shadow: 0 20rpx 80rpx rgba(0, 0, 0, 0.12);
}

.modal-title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 16rpx;
}

/* 标题行（标题+关闭按钮） */
.modal-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}

.modal-title-row .modal-title {
  margin-bottom: 0;
}

.modal-close {
  font-size: 32rpx;
  color: var(--text-muted);
  padding: 8rpx 12rpx;
  border-radius: 12rpx;
  line-height: 1;
}

.modal-close:active {
  background-color: var(--input-bg);
}

.modal-body {
  font-size: 28rpx;
  color: var(--text-secondary);
  margin-bottom: 40rpx;
  line-height: 1.5;
}

.modal-actions {
  display: flex;
  gap: 20rpx;
  justify-content: flex-end;
}

.modal-btn {
  padding: 18rpx 44rpx;
  border-radius: 20rpx;
  font-size: 28rpx;
  font-weight: 600;
}

.modal-btn.cancel {
  color: var(--text-secondary);
  background-color: var(--input-bg);
}

.modal-btn.confirm-delete {
  color: #ffffff;
  background-color: #E8856D;
}

/* ========== 底部输入栏 ========== */
.input-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: var(--glass-bg);
  backdrop-filter: var(--blur);
  -webkit-backdrop-filter: var(--blur);
  border-top: 1px solid var(--border);
  padding: 20rpx 28rpx;
  padding-bottom: max(20rpx, env(safe-area-inset-bottom));
  z-index: 50;
  /* 关键：将输入栏移出 flex 流，覆盖在列表之上 */
}

.editing-hint {
  font-size: 24rpx;
  color: var(--accent-dark);
  text-align: center;
  margin-bottom: 14rpx;
}

.cancel-edit {
  color: var(--text-muted);
  text-decoration: underline;
}

/* 第一行：日期 + 金额 */
.input-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

/* 日期选择器 */
.date-picker {
  display: flex;
  align-items: center;
  padding: 0 18rpx;
  height: 96rpx;
  background: var(--input-bg);
  border-radius: 24rpx;
  flex-shrink: 0;
  border: 1px solid var(--input-border);
}

.date-picker:active {
  background: rgba(0, 0, 0, 0.04);
}

.date-text {
  font-size: 28rpx;
  color: var(--text-primary);
  font-weight: 600;
}

.date-arrow {
  font-size: 18rpx;
  color: var(--text-muted);
  margin-left: 6rpx;
}

/* 金额输入 */
.amount-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 24rpx;
  padding: 0 24rpx;
  height: 96rpx;
}

.yuan-sign {
  font-size: 40rpx;
  font-weight: 600;
  color: var(--text-secondary);
  margin-right: 6rpx;
}

.amount-input {
  flex: 1;
  height: 96rpx;
  font-size: 44rpx;
  font-weight: 600;
  color: var(--text-primary);
  background-color: transparent;
}

.amount-input::placeholder {
  font-size: 26rpx;
  font-weight: 400;
  color: var(--text-muted);
}

.amount-input::-webkit-input-placeholder {
  font-size: 26rpx;
  font-weight: 400;
  color: var(--text-muted);
}

/* 第二行：备注输入 */
.note-row {
  margin-top: 14rpx;
}

.note-input {
  width: 100%;
  height: 80rpx;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 24rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  color: var(--text-primary);
}

.note-input::placeholder {
  font-size: 26rpx;
  font-weight: 400;
  color: var(--text-muted);
}

.note-input::-webkit-input-placeholder {
  font-size: 26rpx;
  font-weight: 400;
  color: var(--text-muted);
}

/* 第三行：标签栏 */
.tags-row-wrapper {
  margin-top: 14rpx;
}

.tags-row {
  display: flex;
  flex-direction: row;
  white-space: nowrap;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.tag-btn {
  display: inline-flex;
  padding: 10rpx 24rpx;
  border-radius: 28rpx;
  font-size: 24rpx;
  color: var(--text-muted);
  background: var(--input-bg);
  margin-right: 10rpx;
  flex-shrink: 0;
  border: 2rpx solid transparent;
}

.tag-btn:active {
  background: var(--accent-light);
  color: var(--accent-dark);
}

.tag-btn.active {
  background: var(--accent-light);
  color: var(--accent-dark);
  border-color: var(--accent);
}

.tag-expand-btn {
  display: inline-flex;
  align-items: center;
  padding: 10rpx 20rpx;
  border-radius: 28rpx;
  font-size: 24rpx;
  color: var(--text-secondary);
  background: var(--input-bg);
  flex-shrink: 0;
}

.tag-expand-btn:active {
  background: rgba(0, 0, 0, 0.04);
}

.expand-arrow {
  font-size: 18rpx;
  margin-left: 4rpx;
}

/* 标签抽屉面板 */
.tags-panel-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 200;
}

.tags-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: var(--blur);
  -webkit-backdrop-filter: var(--blur);
  border-radius: 32rpx 32rpx 0 0;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
}

.tags-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 32rpx;
  border-bottom: 1px solid var(--border);
}

.tags-panel-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-primary);
}

.tags-panel-close {
  font-size: 28rpx;
  color: var(--accent-dark);
  font-weight: 600;
}

.tags-panel-content {
  padding: 24rpx 28rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  overflow-y: auto;
  padding-bottom: max(24rpx, env(safe-area-inset-bottom));
}

.tag-btn-large {
  display: flex;
  align-items: center;
  padding: 16rpx 24rpx;
  border-radius: 22rpx;
  background: var(--input-bg);
  border: 2rpx solid transparent;
}

.tag-btn-large:active {
  background: var(--accent-light);
}

.tag-btn-large.active {
  background: var(--accent-light);
  border-color: var(--accent);
}

.tag-btn-large text:first-child {
  font-size: 28rpx;
  color: var(--text-primary);
}

.tag-count {
  font-size: 22rpx;
  color: var(--text-muted);
  margin-left: 8rpx;
}

/* 第四行：操作按钮 */
.edit-actions {
  margin-top: 18rpx;
}

.action-row {
  display: flex;
  gap: 16rpx;
}

.delete-link {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16rpx 0 6rpx;
}

.delete-link text {
  font-size: 24rpx;
  color: #E8856D;
  font-weight: 400;
}

.delete-link:active text {
  opacity: 0.6;
}

.action-btn {
  flex: 1;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 24rpx;
}

.action-btn.save-btn {
  background: linear-gradient(135deg, #73C7A8, #5BAF8E);
}

.action-btn.save-btn:active {
  background: linear-gradient(135deg, #5BAF8E, #4A9A7A);
  transform: scale(0.98);
}

.action-btn.save-btn.disabled {
  background: #C8D6CF;
  opacity: 0.6;
}

.action-btn.cancel-btn {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
}

.action-btn.cancel-btn:active {
  background: rgba(0, 0, 0, 0.04);
}

.action-btn.cancel-btn text {
  color: var(--text-secondary);
}

.action-btn text {
  font-size: 32rpx;
  font-weight: 600;
  color: #ffffff;
}

/* 新建模式的保存按钮 */
.save-btn-full {
  margin-top: 18rpx;
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #73C7A8, #5BAF8E);
  border-radius: 24rpx;
  box-shadow: 0 8rpx 24rpx rgba(115, 199, 168, 0.3);
}

.save-btn-full:active {
  background: linear-gradient(135deg, #5BAF8E, #4A9A7A);
  transform: scale(0.98);
}

.save-btn-full.disabled {
  background: #C8D6CF;
  opacity: 0.6;
  box-shadow: none;
}

.save-btn-full text {
  font-size: 32rpx;
  font-weight: 600;
  color: #ffffff;
}

/* ========== V2：同步 Toast ========== */
.sync-toast {
  position: fixed;
  top: 80rpx;
  left: 50%;
  transform: translateX(-50%);
  z-index: 300;
  padding: 14rpx 36rpx;
  border-radius: 0 0 20rpx 20rpx;
  backdrop-filter: var(--blur);
  -webkit-backdrop-filter: var(--blur);
}

.sync-toast.success {
  background: rgba(115, 199, 168, 0.92);
}

.sync-toast.error {
  background: rgba(232, 133, 109, 0.92);
}

.sync-toast.sync {
  background: rgba(45, 45, 42, 0.85);
}

.sync-toast-text {
  font-size: 28rpx;
  font-weight: 600;
  color: #ffffff;
}

/* ========== V2：登录弹窗 ========== */
.login-field {
  display: flex;
  align-items: center;
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 20rpx;
  padding: 0 20rpx;
  margin-bottom: 16rpx;
  height: 88rpx;
}

.field-icon {
  font-size: 32rpx;
  margin-right: 12rpx;
}

.login-input {
  flex: 1;
  height: 88rpx;
  font-size: 28rpx;
  color: var(--text-primary);
}

.code-input {
  max-width: 180rpx;
}

.send-code-btn {
  flex-shrink: 0;
  padding: 10rpx 20rpx;
  border-radius: 16rpx;
  background: var(--accent);
}

.send-code-btn.counting {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
}

.send-code-btn text {
  font-size: 24rpx;
  color: #ffffff;
  font-weight: 500;
}

.send-code-btn.counting text {
  color: var(--text-muted);
}

.login-btn {
  height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #73C7A8, #5BAF8E);
  border-radius: 24rpx;
  margin-top: 24rpx;
}

.login-btn.disabled {
  background: #C8D6CF;
  opacity: 0.6;
}

.login-btn text {
  font-size: 32rpx;
  font-weight: 600;
  color: #ffffff;
}

.login-hint {
  font-size: 22rpx;
  color: var(--text-muted);
  text-align: center;
  margin-top: 20rpx;
  display: block;
}

/* ========== V2：月份选择器账户信息 ========== */
.account-section {
  margin-top: 16rpx;
}

.account-divider {
  height: 1px;
  background: var(--border);
  margin-bottom: 18rpx;
}

.account-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6rpx 0;
}

.account-email {
  font-size: 24rpx;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 16rpx;
}

.logout-btn {
  flex-shrink: 0;
  padding: 10rpx 24rpx;
  border-radius: 16rpx;
  background: var(--input-bg);
}

.logout-btn:active {
  background: rgba(0, 0, 0, 0.04);
}

.logout-btn text {
  font-size: 24rpx;
  color: var(--text-muted);
}
</style>