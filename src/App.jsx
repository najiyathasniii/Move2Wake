import { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { LocalNotifications } from "@capacitor/local-notifications";
import poseModel from "./models/pose_landmarker_lite.task?url";
import "./App.css";

const calculateAngle = (a, b, c) => {
  const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
  let angle = Math.abs((radians * 180.0) / Math.PI);
  if (angle > 180.0) {
    angle = 360 - angle;
  }
  return angle;
};

function App() {
  const [alarmTime, setAlarmTime] = useState("");
  const [challenge, setChallenge] = useState("move");
  const [alarmSet, setAlarmSet] = useState(false);
  const [alarmRinging, setAlarmRinging] = useState(false);
  const [challengeComplete, setChallengeComplete] = useState(false);

  const [movementSeconds, setMovementSeconds] = useState(0);
  const [repCount, setRepCount] = useState(0);
  const [movementDetected, setMovementDetected] = useState(false);
  const [cameraError, setCameraError] = useState("");

  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const poseLandmarkerRef = useRef(null);
  const animationFrameRef = useRef(null);

  const previousPositionRef = useRef(null);
  const lastFrameTimeRef = useRef(null);
  const movingTimeRef = useRef(0);

  const challengeRef = useRef(challenge);
  const exerciseStateRef = useRef("start");
  const repCountRef = useRef(0);

  useEffect(() => {
    challengeRef.current = challenge;
  }, [challenge]);

  useEffect(() => {
    const setupNotifications = async () => {
      try {
        const status = await LocalNotifications.checkPermissions();
        if (status.display !== "granted") {
          await LocalNotifications.requestPermissions();
        }

        // sound "alarm" എന്ന് നൽകി (res/raw/alarm.mp3 റഫർ ചെയ്യാൻ)
        await LocalNotifications.createChannel({
          id: "alarm_channel_high",
          name: "Full Alarm Service",
          description: "High Priority Full Screen Alarm",
          sound: "alarm", 
          importance: 5, 
          visibility: 1, 
          vibration: true,
        });

        await LocalNotifications.addListener(
          "localNotificationActionPerformed",
          () => {
            startAlarm();
          }
        );

        await LocalNotifications.addListener(
          "localNotificationReceived",
          () => {
            startAlarm();
          }
        );
      } catch (e) {
        console.log("LocalNotifications setup error:", e);
      }
    };
    setupNotifications();
  }, []);

  const scheduleCapacitorNotification = async (timeStr) => {
    try {
      const [hours, minutes] = timeStr.split(":").map(Number);
      const triggerDate = new Date();
      triggerDate.setHours(hours, minutes, 0, 0);

      if (triggerDate.getTime() <= Date.now()) {
        triggerDate.setDate(triggerDate.getDate() + 1);
      }

      await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
      await LocalNotifications.schedule({
        notifications: [
          {
            title: "⚡ Move2Wake Alarm",
            body: "Wake up! Complete the exercise challenge to stop the alarm!",
            id: 1,
            schedule: { at: triggerDate, allowWhileIdle: true },
            sound: "alarm",
            channelId: "alarm_channel_high",
            ongoing: true,
            autoCancel: false,
            actionTypeId: "OPEN_ALARM",
          },
        ],
      });
    } catch (e) {
      console.log("Error scheduling notification:", e);
    }
  };

  const startAlarm = async () => {
    setAlarmRinging(true);
    setChallengeComplete(false);
    setMovementSeconds(0);
    setRepCount(0);
    setMovementDetected(false);
    setCameraError("");

    movingTimeRef.current = 0;
    repCountRef.current = 0;
    exerciseStateRef.current = "start";
    previousPositionRef.current = null;
    lastFrameTimeRef.current = null;

    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        await audioRef.current.play();
      }
    } catch (error) {
      console.log("Audio play error:", error);
    }

    startCamera();
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        initializePoseLandmarker();
      }
    } catch (error) {
      console.error("Camera error:", error);
      setCameraError("Camera permission is required. Please allow camera access.");
    }
  };

  const initializePoseLandmarker = async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      const poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: poseModel,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numPoses: 1,
      });

      poseLandmarkerRef.current = poseLandmarker;
      detectMovement();
    } catch (error) {
      console.error("MediaPipe error:", error);
      setCameraError("Failed to initialize motion tracking. Please check your network.");
    }
  };

  const detectMovement = () => {
    if (!videoRef.current || !poseLandmarkerRef.current) return;

    const video = videoRef.current;
    const currentChallenge = challengeRef.current;

    if (video.readyState >= 2) {
      const timestamp = performance.now();
      const result = poseLandmarkerRef.current.detectForVideo(video, timestamp);

      if (result.landmarks && result.landmarks.length > 0) {
        const landmarks = result.landmarks[0];

        if (currentChallenge === "move") {
          const leftShoulder = landmarks[11];
          const rightShoulder = landmarks[12];
          const leftHip = landmarks[23];
          const rightHip = landmarks[24];

          const centerX = (leftShoulder.x + rightShoulder.x + leftHip.x + rightHip.x) / 4;
          const centerY = (leftShoulder.y + rightShoulder.y + leftHip.y + rightHip.y) / 4;
          const currentPosition = { x: centerX, y: centerY };

          if (previousPositionRef.current) {
            const dx = currentPosition.x - previousPositionRef.current.x;
            const dy = currentPosition.y - previousPositionRef.current.y;
            const movementDistance = Math.sqrt(dx * dx + dy * dy);

            if (movementDistance > 0.012) {
              setMovementDetected(true);
              const currentTime = performance.now();
              if (lastFrameTimeRef.current) {
                const elapsed = (currentTime - lastFrameTimeRef.current) / 1000;
                movingTimeRef.current += elapsed;

                const seconds = Math.min(10, Math.floor(movingTimeRef.current));
                setMovementSeconds(seconds);

                if (movingTimeRef.current >= 10) {
                  stopAlarm();
                  return;
                }
              }
              lastFrameTimeRef.current = currentTime;
            } else {
              setMovementDetected(false);
            }
          }
          previousPositionRef.current = currentPosition;
        } else if (currentChallenge === "squats") {
          const leftHip = landmarks[23];
          const leftKnee = landmarks[25];
          const leftAnkle = landmarks[27];
          const rightHip = landmarks[24];
          const rightKnee = landmarks[26];
          const rightAnkle = landmarks[28];

          const leftKneeAngle = calculateAngle(leftHip, leftKnee, leftAnkle);
          const rightKneeAngle = calculateAngle(rightHip, rightKnee, rightAnkle);

          const isSquattingDown = leftKneeAngle < 130 || rightKneeAngle < 130;
          const isStandingUp = leftKneeAngle > 155 && rightKneeAngle > 155;

          if (isSquattingDown) {
            setMovementDetected(true);
            if (exerciseStateRef.current !== "down") {
              exerciseStateRef.current = "down";
            }
          } else if (isStandingUp) {
            if (exerciseStateRef.current === "down") {
              exerciseStateRef.current = "up";
              repCountRef.current += 1;
              setRepCount(repCountRef.current);

              if (repCountRef.current >= 5) {
                stopAlarm();
                return;
              }
            }
          }
        } else if (currentChallenge === "jumping-jacks") {
          const leftWrist = landmarks[15];
          const rightWrist = landmarks[16];
          const leftShoulder = landmarks[11];
          const rightShoulder = landmarks[12];

          const handsUp = leftWrist.y < leftShoulder.y && rightWrist.y < rightShoulder.y;

          if (handsUp) {
            setMovementDetected(true);
            if (exerciseStateRef.current !== "out") {
              exerciseStateRef.current = "out";
            }
          } else {
            if (exerciseStateRef.current === "out") {
              exerciseStateRef.current = "in";
              repCountRef.current += 1;
              setRepCount(repCountRef.current);

              if (repCountRef.current >= 5) {
                stopAlarm();
                return;
              }
            }
          }
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(detectMovement);
  };

  const stopAlarm = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setAlarmRinging(false);
    setAlarmSet(false);
    setChallengeComplete(true);

    if (challenge === "move") {
      setMovementSeconds(10);
    } else {
      setRepCount(5);
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    previousPositionRef.current = null;
    lastFrameTimeRef.current = null;
    movingTimeRef.current = 0;
  };

  const cancelAlarm = async () => {
    setAlarmSet(false);
    setAlarmTime("");
    try {
      await LocalNotifications.cancel({ notifications: [{ id: 1 }] });
    } catch (e) {
      console.log("Error canceling notification:", e);
    }
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (poseLandmarkerRef.current) {
        poseLandmarkerRef.current.close();
      }
    };
  }, []);

  const isMoveChallenge = challenge === "move";
  const currentValue = isMoveChallenge ? movementSeconds : repCount;
  const targetValue = isMoveChallenge ? 10 : 5;
  const progressPercentage = (currentValue / targetValue) * 100;

  return (
    <div className="app">
      <audio ref={audioRef} loop>
        <source src="/alarm.mp3" type="audio/mpeg" />
      </audio>

      <header className="header">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          Move2Wake
        </div>
        <div className="status">
          <span className="status-dot"></span>
          {alarmRinging ? "Alarm Ringing" : "Ready"}
        </div>
      </header>

      <main className="main-content">
        {!alarmRinging ? (
          <>
            <section className="hero">
              <div className="hero-text">
                <p className="small-label">WAKE UP DIFFERENT</p>
                <h1>
                  Don't just wake up.<br />
                  <span>Move.</span>
                </h1>
                <p className="description">
                  Move2Wake is an alarm that makes you get out of bed and move before it stops.
                </p>
              </div>
              <div className="hero-visual">
                <div className="motion-circle">
                  <div className="person">🕺</div>
                </div>
              </div>
            </section>

            <section className="alarm-section">
              <div className="section-heading">
                <p className="small-label">YOUR ALARM</p>
                <h2>Set your wake-up time</h2>
              </div>
              <div className="alarm-card">
                <div className="input-group">
                  <label>Alarm time</label>
                  <input
                    type="time"
                    value={alarmTime}
                    onChange={(event) => {
                      setAlarmTime(event.target.value);
                      setAlarmSet(false);
                    }}
                  />
                </div>
                <div className="input-group">
                  <label>Challenge</label>
                  <select
                    value={challenge}
                    onChange={(event) => setChallenge(event.target.value)}
                  >
                    <option value="move">Move for 10 seconds</option>
                    <option value="squats">5 Squats</option>
                    <option value="jumping-jacks">5 Jumping Jacks</option>
                  </select>
                </div>

                {!alarmSet ? (
                  <button
                    className="set-alarm-button"
                    onClick={async () => {
                      if (!alarmTime) {
                        alert("Please select a time.");
                        return;
                      }
                      try {
                        await scheduleCapacitorNotification(alarmTime);
                        setAlarmSet(true);
                      } catch (error) {
                        alert("Error setting alarm:\n" + error.message);
                      }
                    }}
                  >
                    ⏰ Set Alarm
                  </button>
                ) : (
                  <button className="cancel-button" onClick={cancelAlarm}>
                    Cancel Alarm
                  </button>
                )}
              </div>

              {alarmSet && (
                <div className="alarm-success">
                  <div className="success-icon">✓</div>
                  <div>
                    <strong>Alarm is set!</strong>
                    <p>Your alarm will ring at <b>{alarmTime}</b></p>
                    <p>
                      Challenge: <b>
                        {challenge === "move"
                          ? "Move for 10 seconds"
                          : challenge === "squats"
                          ? "5 Squats"
                          : "5 Jumping Jacks"}
                      </b>
                    </p>
                  </div>
                </div>
              )}

              {challengeComplete && (
                <div className="alarm-success">
                  <div className="success-icon">✓</div>
                  <div>
                    <strong>Challenge completed!</strong>
                    <p>Good morning! Your alarm has stopped.</p>
                  </div>
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="alarm-screen">
            <p className="small-label">GOOD MORNING</p>
            <h1>GET MOVING!</h1>
            <p className="alarm-message">
              {challenge === "move"
                ? "Move your body for 10 seconds to stop the alarm."
                : challenge === "squats"
                ? "Complete 5 squats to stop the alarm."
                : "Complete 5 jumping jacks to stop the alarm."}
            </p>

            <div className="camera-container">
              <video ref={videoRef} autoPlay playsInline muted />
              <div className="camera-overlay">
                <div className="movement-counter">
                  {currentValue}
                  <span>/{targetValue}</span>
                </div>
                <p>{movementDetected ? "Exercise action detected!" : "Do the selected exercise!"}</p>
              </div>
            </div>

            {cameraError && (
              <p style={{ color: "red", marginTop: "15px" }}>{cameraError}</p>
            )}

            <div className="progress-container">
              <div
                className="progress-bar"
                style={{ width: `${progressPercentage}%` }}
              ></div>
            </div>
            <p className="progress-text">
              {isMoveChallenge
                ? `${currentValue} seconds of movement completed`
                : `${currentValue} reps completed`}
            </p>
          </section>
        )}
      </main>

      <footer>
        <p>Move2Wake</p>
        <span>Wake up. Move. Repeat.</span>
      </footer>
    </div>
  );
}

export default App;