import { useEffect, useRef, useState } from "react";
import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import poseModel from "./models/pose_landmarker_lite.task?url";
import "./App.css";

function App() {
  // ==============================
  // STATE
  // ==============================

  const [alarmTime, setAlarmTime] = useState("");
  const [challenge, setChallenge] = useState("move");
  const [alarmSet, setAlarmSet] = useState(false);
  const [alarmRinging, setAlarmRinging] = useState(false);
  const [challengeComplete, setChallengeComplete] = useState(false);

  const [movementSeconds, setMovementSeconds] = useState(0);
  const [movementDetected, setMovementDetected] = useState(false);

  const [cameraError, setCameraError] = useState("");

  // ==============================
  // REFERENCES
  // ==============================

  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const poseLandmarkerRef = useRef(null);
  const animationFrameRef = useRef(null);

  const previousPositionRef = useRef(null);
  const lastFrameTimeRef = useRef(null);
  const movingTimeRef = useRef(0);

  // ==============================
  // CHECK ALARM TIME
  // ==============================

  useEffect(() => {
    if (!alarmSet || !alarmTime || alarmRinging) {
      return;
    }

    const timer = setInterval(() => {
      const now = new Date();

      const hours = String(now.getHours()).padStart(2, "0");
      const minutes = String(now.getMinutes()).padStart(2, "0");

      const currentTime = `${hours}:${minutes}`;

      if (currentTime === alarmTime) {
        startAlarm();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [alarmSet, alarmTime, alarmRinging]);

  // ==============================
  // START ALARM
  // ==============================

  const startAlarm = async () => {
    setAlarmRinging(true);
    setChallengeComplete(false);
    setMovementSeconds(0);
    setMovementDetected(false);
    setCameraError("");

    movingTimeRef.current = 0;
    previousPositionRef.current = null;
    lastFrameTimeRef.current = null;

    // Play alarm
    try {
      if (audioRef.current) {
        await audioRef.current.play();
      }
    } catch (error) {
      console.log("Browser blocked automatic audio:", error);
    }

    startCamera();
  };

  // ==============================
  // START CAMERA
  // ==============================

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 640,
          height: 480,
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

      setCameraError(
        "Camera permission is required. Please allow camera access."
      );
    }
  };

  // ==============================
  // INITIALIZE MEDIAPIPE
  // ==============================

  const initializePoseLandmarker = async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
      );

      const poseLandmarker = await PoseLandmarker.createFromOptions(
        vision,
        {
          baseOptions: {
            modelAssetPath: poseModel,
            delegate: "GPU",
          },

          runningMode: "VIDEO",

          numPoses: 1,
        }
      );

      poseLandmarkerRef.current = poseLandmarker;

      console.log("MediaPipe Pose Landmarker ready!");

      detectMovement();
    } catch (error) {
      console.error("MediaPipe error:", error);
    }
  };

  // ==============================
  // MOVEMENT DETECTION
  // ==============================

  const detectMovement = () => {
    if (
      !videoRef.current ||
      !poseLandmarkerRef.current
    ) {
      return;
    }

    const video = videoRef.current;

    if (video.readyState >= 2) {
      const timestamp = performance.now();

      const result =
        poseLandmarkerRef.current.detectForVideo(
          video,
          timestamp
        );

      // Check if body is detected
      if (
        result.landmarks &&
        result.landmarks.length > 0
      ) {
        const landmarks = result.landmarks[0];

        // Left shoulder
        const leftShoulder = landmarks[11];

        // Right shoulder
        const rightShoulder = landmarks[12];

        // Left hip
        const leftHip = landmarks[23];

        // Right hip
        const rightHip = landmarks[24];

        // Calculate body center
        const centerX =
          (leftShoulder.x +
            rightShoulder.x +
            leftHip.x +
            rightHip.x) /
          4;

        const centerY =
          (leftShoulder.y +
            rightShoulder.y +
            leftHip.y +
            rightHip.y) /
          4;

        const currentPosition = {
          x: centerX,
          y: centerY,
        };

        // Compare current position
        // with previous position
        if (previousPositionRef.current) {
          const dx =
            currentPosition.x -
            previousPositionRef.current.x;

          const dy =
            currentPosition.y -
            previousPositionRef.current.y;

          const movementDistance = Math.sqrt(
            dx * dx + dy * dy
          );

          // Movement threshold
          if (movementDistance > 0.012) {
            setMovementDetected(true);

            const currentTime =
              performance.now();

            if (lastFrameTimeRef.current) {
              const elapsed =
                (currentTime -
                  lastFrameTimeRef.current) /
                1000;

              movingTimeRef.current += elapsed;

              const seconds = Math.min(
                10,
                Math.floor(
                  movingTimeRef.current
                )
              );

              setMovementSeconds(seconds);

              // Stop after 10 seconds
              if (
                movingTimeRef.current >= 10
              ) {
                stopAlarm();
                return;
              }
            }

            lastFrameTimeRef.current =
              currentTime;
          }
        }

        previousPositionRef.current =
          currentPosition;
      }
    }

    animationFrameRef.current =
      requestAnimationFrame(
        detectMovement
      );
  };

  // ==============================
  // STOP ALARM
  // ==============================

  const stopAlarm = () => {
    setAlarmRinging(false);
    setAlarmSet(false);
    setChallengeComplete(true);
    setMovementSeconds(10);

    // Stop alarm sound
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    // Stop camera
    if (streamRef.current) {
      streamRef.current
        .getTracks()
        .forEach((track) => {
          track.stop();
        });

      streamRef.current = null;
    }

    // Stop MediaPipe detection
    if (animationFrameRef.current) {
      cancelAnimationFrame(
        animationFrameRef.current
      );

      animationFrameRef.current = null;
    }

    previousPositionRef.current = null;
    lastFrameTimeRef.current = null;
    movingTimeRef.current = 0;
  };

  // ==============================
  // CANCEL ALARM
  // ==============================

  const cancelAlarm = () => {
    setAlarmSet(false);
    setAlarmTime("");
  };

  // ==============================
  // CLEANUP
  // ==============================

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(
          animationFrameRef.current
        );
      }

      if (streamRef.current) {
        streamRef.current
          .getTracks()
          .forEach((track) => {
            track.stop();
          });
      }

      if (poseLandmarkerRef.current) {
        poseLandmarkerRef.current.close();
      }
    };
  }, []);

  // ==============================
  // USER INTERFACE
  // ==============================

  return (
    <div className="app">

      {/* ==========================
          ALARM SOUND
      ========================== */}

      <audio
        ref={audioRef}
        loop
      >
        <source
          src="/alarm.mp3"
          type="audio/mpeg"
        />
      </audio>

      {/* ==========================
          HEADER
      ========================== */}

      <header className="header">

        <div className="logo">

          <span className="logo-icon">
            ⚡
          </span>

          Move2Wake

        </div>

        <div className="status">

          <span className="status-dot"></span>

          {alarmRinging
            ? "Alarm Ringing"
            : "Ready"}

        </div>

      </header>

      {/* ==========================
          MAIN
      ========================== */}

      <main className="main-content">

        {!alarmRinging ? (

          <>

            {/* =====================
                HERO
            ===================== */}

            <section className="hero">

              <div className="hero-text">

                <p className="small-label">
                  WAKE UP DIFFERENT
                </p>

                <h1>
                  Don't just wake up.
                  <br />

                  <span>
                    Move.
                  </span>

                </h1>

                <p className="description">
                  Move2Wake is an alarm that
                  makes you get out of bed and
                  move before it stops.
                </p>

              </div>

              <div className="hero-visual">

                <div className="motion-circle">

                  <div className="person">
                    🕺
                  </div>

                </div>

              </div>

            </section>

            {/* =====================
                ALARM SECTION
            ===================== */}

            <section className="alarm-section">

              <div className="section-heading">

                <p className="small-label">
                  YOUR ALARM
                </p>

                <h2>
                  Set your wake-up time
                </h2>

              </div>

              <div className="alarm-card">

                {/* ALARM TIME */}

                <div className="input-group">

                  <label>
                    Alarm time
                  </label>

                  <input
                    type="time"
                    value={alarmTime}
                    onChange={(event) => {
                      setAlarmTime(
                        event.target.value
                      );

                      setAlarmSet(false);
                    }}
                  />

                </div>

                {/* CHALLENGE */}

                <div className="input-group">

                  <label>
                    Challenge
                  </label>

                  <select
                    value={challenge}
                    onChange={(event) =>
                      setChallenge(
                        event.target.value
                      )
                    }
                  >

                    <option value="move">
                      Move for 10 seconds
                    </option>

                    <option value="squats">
                      5 Squats
                    </option>

                    <option value="jumping-jacks">
                      5 Jumping Jacks
                    </option>

                  </select>

                </div>

                {/* BUTTON */}

                {!alarmSet ? (

                  <button
                    className="set-alarm-button"
                    onClick={async () => {

                      if (!alarmTime) {
                        alert(
                          "Please select a time."
                        );
                        return;
                      }

                     try {
  const response = await fetch(
    "https://move2wake.onrender.com/api/alarms",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        alarmTime: alarmTime,
        challenge: challenge,
      }),
    }
  );

  const text = await response.text();

  console.log("Backend status:", response.status);
  console.log("Backend response:", text);

  if (response.ok) {
    console.log("Alarm saved successfully!");
    setAlarmSet(true);
  } else {
    alert(
      "Backend error: " +
        response.status +
        "\n" +
        text
    );
  }

} catch (error) {
  console.error("Backend error:", error);

  alert(
    "Connection error:\n" +
      error.message
  );
}
                    ⏰ Set Alarm
                  </button>

                ) : (

                  <button
                    className="cancel-button"
                    onClick={cancelAlarm}
                  >
                    Cancel Alarm
                  </button>

                )}

              </div>

              {/* =====================
                  ALARM SET MESSAGE
              ===================== */}

              {alarmSet && (

                <div className="alarm-success">

                  <div className="success-icon">
                    ✓
                  </div>

                  <div>

                    <strong>
                      Alarm is set!
                    </strong>

                    <p>
                      Your alarm will ring at{" "}
                      <b>
                        {alarmTime}
                      </b>
                    </p>

                    <p>
                      Challenge:{" "}

                      <b>
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

              {/* =====================
                  COMPLETED MESSAGE
              ===================== */}

              {challengeComplete && (

                <div className="alarm-success">

                  <div className="success-icon">
                    ✓
                  </div>

                  <div>

                    <strong>
                      Challenge completed!
                    </strong>

                    <p>
                      Good morning! Your alarm
                      has stopped.
                    </p>

                  </div>

                </div>

              )}

            </section>

          </>

        ) : (

          /* ==========================
             ALARM SCREEN
          ========================== */

          <section className="alarm-screen">

            <p className="small-label">
              GOOD MORNING
            </p>

            <h1>
              GET MOVING!
            </h1>

            <p className="alarm-message">

              {challenge === "move"
                ? "Move your body for 10 seconds to stop the alarm."
                : challenge === "squats"
                ? "Complete 5 squats to stop the alarm."
                : "Complete 5 jumping jacks to stop the alarm."}

            </p>

            {/* CAMERA */}

            <div className="camera-container">

              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
              />

              <div className="camera-overlay">

                <div className="movement-counter">

                  {movementSeconds}

                  <span>
                    /10
                  </span>

                </div>

                <p>

                  {movementDetected
                    ? "Movement detected! Keep moving!"
                    : "Move your body!"}

                </p>

              </div>

            </div>

            {/* CAMERA ERROR */}

            {cameraError && (

              <p
                style={{
                  color: "red",
                  marginTop: "15px",
                }}
              >
                {cameraError}
              </p>

            )}

            {/* PROGRESS */}

            <div className="progress-container">

              <div
                className="progress-bar"
                style={{
                  width:
                    `${movementSeconds * 10}%`,
                }}
              ></div>

            </div>

            <p className="progress-text">

              {movementSeconds}
              {" "}
              seconds of movement completed

            </p>

          </section>

        )}

      </main>

      {/* ==========================
          FOOTER
      ========================== */}

      <footer>

        <p>
          Move2Wake
        </p>

        <span>
          Wake up. Move. Repeat.
        </span>

      </footer>

    </div>
  );
}

export default App;
