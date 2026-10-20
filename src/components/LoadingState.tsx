import React from "react";
import styles from "./LoadingState.less";

interface Props {
  text: string;
}

/** 页面级加载。人物造型对齐 fat-notes-core 函数页空状态里的跳舞小人。 */
const LoadingState: React.FC<Props> = ({ text }) => {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <div className={styles.stage}>
        <span className={styles.note} />
        <span className={`${styles.note} ${styles.noteRight}`} />
        <div className={styles.dancer}>
          <div className={styles.head}>
            <div className={styles.ponytail} />
            <div className={styles.hair} />
            <div className={styles.face}>
              <span className={styles.eyeLeft}>
                <span className={styles.pupil} />
              </span>
              <span className={styles.eyeRight}>
                <span className={styles.pupil} />
              </span>
              <span className={styles.blushLeft} />
              <span className={styles.blushRight} />
              <span className={styles.smile} />
            </div>
          </div>
          <div className={styles.torso}>
            <div className={styles.shirt} />
          </div>
          <div className={`${styles.arm} ${styles.armLeft}`}>
            <div className={styles.sleeve} />
            <div className={styles.forearm}>
              <span className={styles.hand} />
            </div>
          </div>
          <div className={`${styles.arm} ${styles.armRight}`}>
            <div className={styles.sleeve} />
            <div className={styles.forearm}>
              <span className={styles.hand} />
            </div>
          </div>
          <div className={styles.legs}>
            <div className={`${styles.leg} ${styles.legLeft}`}>
              <div className={styles.shoe} />
            </div>
            <div className={`${styles.leg} ${styles.legRight}`}>
              <div className={styles.shoe} />
            </div>
          </div>
        </div>
        <div className={styles.shadow} />
      </div>
      <div className={styles.text}>{text}</div>
    </div>
  );
};

export default LoadingState;
