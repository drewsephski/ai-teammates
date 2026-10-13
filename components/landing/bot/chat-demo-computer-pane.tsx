"use client"

import { useState } from "react"
import type { DemoAgent } from "./chat-demo-data"
import { DemoDesktop } from "./chat-demo-screen"
import type { DemoScreen } from "./chat-demo-timeline"
import { DemoAvatar as Avatar, DemoIcon as Icon } from "./chat-demo-ui"
import styles from "./chat-demo.module.css"

export function DemoComputerPane({
  selected,
  selectedName,
  screen,
  routines,
  onScreen,
  onClose,
}: {
  selected: DemoAgent
  selectedName: string
  screen: DemoScreen
  routines: DemoAgent["routines"]
  onScreen: () => void
  onClose: () => void
}) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notifications, setNotifications] = useState(true)
  return (
    <aside
      className={styles.computerPane}
      aria-label={`${selectedName}'s computer`}
    >
      <header className={styles.paneHeader}>
        {settingsOpen && (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Back to computer"
            onClick={() => setSettingsOpen(false)}
          >
            <Icon name="back" size={15} />
          </button>
        )}
        <span>{settingsOpen ? "Settings" : ""}</span>
        {!settingsOpen && (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Agent settings"
            onClick={() => setSettingsOpen(true)}
          >
            <Icon name="gear" size={15} />
          </button>
        )}
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Close computer"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <div className={styles.paneContent}>
        {settingsOpen ? (
          <>
            <div className={styles.settingsAvatar}>
              <Avatar agent={{ ...selected, unread: false }} size={64} />
            </div>
            {[
              { label: "Name", value: selectedName },
              { label: "Title (optional)", value: selected.title },
              { label: "Description", value: selected.description },
            ].map((field) => (
              <div key={field.label} className={styles.settingsField}>
                <span>{field.label}</span>
                <div>{field.value || "Add a title"}</div>
              </div>
            ))}
            <div className={styles.notificationSetting}>
              <div>
                Notifications
                <p>Get notified when this agent finishes or needs input</p>
              </div>
              <button
                className={styles.toggle}
                role="switch"
                aria-checked={notifications}
                aria-label="Notifications"
                type="button"
                onClick={() => setNotifications((on) => !on)}
              >
                <span />
              </button>
            </div>
          </>
        ) : (
          <>
            <DemoDesktop screen={screen} onExpand={onScreen} />
            <p className={styles.screenCaption}>{selectedName}’s screen</p>
            <div className={styles.routines}>
              <span>Routines</span>
              {routines.length ? (
                routines.map((routine) => (
                  <div key={routine.name}>
                    <Icon name="clock" size={15} />
                    <p>
                      {routine.name}
                      <span>{routine.trigger}</span>
                    </p>
                  </div>
                ))
              ) : (
                <p>
                  Nothing scheduled yet. Ask {selectedName} to do something
                  every morning and it shows up here.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
