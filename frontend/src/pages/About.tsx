import { Link } from 'react-router-dom'

// 关于与免责（PRD v5.0 重写，取代 v4.0.1 的 F13）
// 这一页是全站红线的落点：不宣称疗效、不诱导自诊、危机入口不可砍——所以三件事都写在这里
function About() {
  return (
    <div className="about">
      <h1>关于心汐</h1>
      <p className="about-lead">
        心汐是一个还在做的东西。名字的意思是「心里的潮汐」——潮有来就有退，不必急着把它按住，也不用催它快点走。
      </p>

      <section className="about-section">
        <h2>它是什么</h2>
        <p>
          三个地方：一个出口（听你说）、一盏灯（找方向）、一个每天在的伴（写一写）。
          三块都能单独用，谁都不需要你先做完另一个。
        </p>
      </section>

      <section className="about-section">
        <h2>它不是什么</h2>
        <ul className="about-list">
          <li>
            <strong>不是医院，也不是心理咨询。</strong>心汐不提供医疗诊断与治疗，不替代专业帮助。
          </li>
          <li>
            <strong>不给你打分，也不给你贴标签。</strong>没有总分、没有档位、没有「你的程度是几级」。
            测评只给一段描述，和接下来可以看看什么。
          </li>
          <li>
            <strong>不催你。</strong>没有「连续第几天」、没有「你已中断」、没有排行榜。这些东西默认是关的，
            你想开才开。
          </li>
          <li>
            <strong>现在还很小。</strong>听你说和写一写还没做完，找方向的内容也只是一部分。
            页面里写着「还在准备」的地方，是真的还没做。
          </li>
        </ul>
      </section>

      <section className="about-section">
        <h2>你在这里写的东西</h2>
        <p>
          现在这一版，你在找方向勾的主题只存在你自己的浏览器里，我们看不到，也收不到。
          等以后接上账号同步，会改成「只有你自己登录后能看到」——那时候这页会重新写一遍，写清楚存了什么、存在哪。
        </p>
        <p>心汐不卖数据，也不拿你的内容做任何画像分析。</p>
      </section>

      <section className="about-section">
        <h2>如果你现在很难熬</h2>
        <p>
          心汐帮不了急的事。真的撑不住的时候，请找真人：
          <Link to="/help">这里有一些可以立刻打通的号码</Link>。
          打不通或者不想打电话，也可以直接去最近的医院急诊。
        </p>
      </section>

      <section className="about-section">
        <h2>谁做的</h2>
        <p>
          一个边学边做的个人项目，用 AI 辅助开发，代码在 GitHub 上开源。
          它现在的样子离「做完了」还很远，但每一版都会保证一件事：打开就能用，不用先注册。
        </p>
      </section>

      <div className="about-actions">
        <Link to="/" className="btn btn-quiet">回首页</Link>
        <Link to="/guide" className="btn btn-primary">去找方向看看</Link>
      </div>
    </div>
  )
}

export default About
