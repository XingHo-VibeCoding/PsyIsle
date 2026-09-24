import { emergencyHotlines, nationalHotlines, regionHotlines, HOTLINES_VERIFIED_AT } from '../data/hotlines'

// F12 危机资源页：全站优先级最高的页面
// 红线：首屏不滚动可见 120/110/12356；禁红色警示色；无广告、无表单、无劝慰
function Help() {
  return (
    <div className="help">
      <h1>需要帮助的时候，可以找谁</h1>
      <p className="help-note">如果现在很危险，请立刻联系 120，或让身边的人陪着你。</p>

      <div className="emergency">
        {emergencyHotlines.map((h) => (
          <a key={h.number} href={`tel:${h.number}`} className="emergency-btn">
            <strong>{h.number}</strong>
            <span>{h.label}</span>
          </a>
        ))}
      </div>

      <section className="help-section">
        <h2>全国范围 · 打哪个城市都通</h2>
        <ul className="hotline-list">
          {nationalHotlines.map((h) => (
            <li key={h.number} className="hotline-item">
              <a href={`tel:${h.number}`} className="hotline-number">{h.number}</a>
              <p className="hotline-org">{h.organizer}</p>
              <p className="hotline-meta">服务时间：{h.hours}</p>
              <p className="hotline-meta">什么情况用：{h.scenario}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="help-section">
        <h2>地区范围 · 24 小时热线样例</h2>
        <p className="help-meta">示例，非完整名单。每个号码旁标注了核实日期。</p>
        <ul className="hotline-list">
          {regionHotlines.map((h) => (
            <li key={h.number} className="hotline-item hotline-row">
              <span className="hotline-region">{h.region}</span>
              <a href={`tel:${h.number}`} className="hotline-number">{h.number}</a>
              <span className="hotline-meta">{h.note} · 核实于 {h.verifiedAt}</span>
            </li>
          ))}
        </ul>
        <p className="help-tip">没找到你所在的地区？直接拨 12356，会自动接通你所在地。</p>
      </section>

      <section className="help-section">
        <h2>需要面对面时</h2>
        <ul className="facelist">
          <li>挂号分两种：<strong>精神科</strong>（可开药）和 <strong>心理科 / 心理咨询</strong>（以谈话为主）——想清楚自己需要哪种，这是很多人卡住的地方。</li>
          <li><strong>大学生医保可报销部分门诊费</strong>；校医院可以开转诊单。</li>
          <li>部分高校设有校内精神（心理）科门诊，费用由学校承担——若有，通常免费且更近。</li>
        </ul>
      </section>

      <p className="help-meta">号码核实日期：{HOTLINES_VERIFIED_AT}。本页不申请定位权限、不收集手机号。</p>
    </div>
  )
}

export default Help
