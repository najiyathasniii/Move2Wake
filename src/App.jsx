import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { LocalNotifications } from "@capacitor/local-notifications";
import { registerPlugin } from "@capacitor/core";

import poseModel from "./models/pose_landmarker_lite.task?url";
import "./App.css";


// ---------------------------------------------------------
// Native Alarm Plugin
// ---------------------------------------------------------

const CustomAlarm = registerPlugin("AlarmPlugin");


// ---------------------------------------------------------
// Calculate angle between 3 points
// ---------------------------------------------------------

const calculateAngle = (a, b, c) => {
  const radians =
    Math.atan2(c.y - b.y, c.x - b.x) -
    Math.atan2(a.y - b.y, a.x - b.x);

  let angle = Math.abs((radians * 180.0) / Math.PI);

  if (angle > 180.0) {
    angle = 360 - angle;
  }

  return angle;
};


// =========================================================
// APP
// =========================================================

function App() {

  // -------------------------------------------------------
  // STATE
  // -------------------------------------------------------

  const [alarmTime, setAlarmTime] = useState("");
  const [challenge, setChallenge] = useState("move");

  const [alarmSet, setAlarmSet] = useState(false);
  const [alarmRinging, setAlarmRinging] = useState(false);
  const [challengeComplete, setChallengeComplete] =
    useState(false);

  const [movementSeconds, setMovementSeconds] =
    useState(0);

  const [repCount, setRepCount] = useState(0);

  const [movementDetected, setMovementDetected] =
    useState(false);

  const [cameraError, setCameraError] =
    useState("");


  // -------------------------------------------------------
  // REFS
  // -------------------------------------------------------

  const audioRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const poseLandmarkerRef = useRef(null);

  const animationFrameRef = useRef(null);

  const previousPositionRef = useRef(null);
  const lastFrameTimeRef = useRef(null);
  const movingTimeRef = useRef(0);

  const challengeRef = useRef(challenge);

  const exerciseStateRef =
    useRef("start");

  // Separate squat state so it never conflicts with jumping-jack state.
  const squatStateRef = useRef({
    phase: "standing",
    standingHipY: null,
    downFrames: 0,
  });

  const repCountRef =
    useRef(0);

  // Prevent multiple MediaPipe loops
  const detectingRef =
    useRef(false);


  // -------------------------------------------------------
  // Keep challenge ref updated
  // -------------------------------------------------------

  useEffect(() => {

    challengeRef.current = challenge;

  }, [challenge]);


  // =======================================================
  // NATIVE ANDROID ALARM → REACT
  // =======================================================

  useEffect(() => {

    console.log(
      "✅ Move2Wake React app loaded"
    );


    const handleAlarmTriggered = () => {

      console.log(
        "🚨🚨 ANDROID ALARM TRIGGERED 🚨🚨"
      );

      startAlarm();

    };


    window.addEventListener(
      "alarmTriggered",
      handleAlarmTriggered
    );


    return () => {

      window.removeEventListener(
        "alarmTriggered",
        handleAlarmTriggered
      );

    };

  }, []);


  // =======================================================
  // CAPACITOR NOTIFICATIONS
  // =======================================================

  useEffect(() => {

    const setupNotifications = async () => {

      try {

        const status =
          await LocalNotifications.checkPermissions();


        if (status.display !== "granted") {

          await LocalNotifications.requestPermissions();

        }


        // Notification channel
        await LocalNotifications.createChannel({

          id: "alarm_channel_high",

          name: "Full Alarm Service",

          description:
            "High Priority Full Screen Alarm",

          sound: "alarm",

          importance: 5,

          visibility: 1,

          vibration: true,

        });


        // Native AlarmReceiver handles the alarm event.
        // Do not call startAlarm from notification callbacks, which can initialize the camera twice.

      } catch (error) {

        console.log(
          "LocalNotifications setup error:",
          error
        );

      }

    };


    setupNotifications();


    return () => {

      LocalNotifications.removeAllListeners();

    };

  }, []);


  // =======================================================
  // SCHEDULE NATIVE ALARM
  // =======================================================

  const scheduleCapacitorNotification =
    async (timeStr) => {

      try {

        const [hours, minutes] =
          timeStr
            .split(":")
            .map(Number);


        const triggerDate =
          new Date();


        triggerDate.setHours(
          hours,
          minutes,
          0,
          0
        );


        // If selected time already passed,
        // schedule for tomorrow
        if (
          triggerDate.getTime() <=
          Date.now()
        ) {

          triggerDate.setDate(
            triggerDate.getDate() + 1
          );

        }


        console.log(
          "⏰ Setting alarm:",
          triggerDate.toString()
        );


        await CustomAlarm.setAlarm({

          time:
            triggerDate.getTime(),

        });


        console.log(
          "✅ Native alarm scheduled"
        );

      } catch (error) {

        console.error(
          "❌ Error scheduling alarm:",
          error
        );

        throw error;

      }

    };


  // =======================================================
  // START ALARM
  // =======================================================

  const startAlarm = async () => {

    console.log(
      "🔥🔥 START ALARM CALLED 🔥🔥"
    );


    // Stop any previous detection loop
    if (animationFrameRef.current) {

      cancelAnimationFrame(
        animationFrameRef.current
      );

      animationFrameRef.current =
        null;

    }


    detectingRef.current =
      false;


    // Reset UI
    setAlarmRinging(true);

    setChallengeComplete(false);

    setMovementSeconds(0);

    setRepCount(0);

    setMovementDetected(false);

    setCameraError("");


    // Reset refs
    movingTimeRef.current = 0;

    repCountRef.current = 0;

    exerciseStateRef.current =
      "start";

    squatStateRef.current = { phase: "standing", standingHipY: null, downFrames: 0 };

    previousPositionRef.current =
      null;

    lastFrameTimeRef.current =
      null;


    // -----------------------------------------------------
    // Native alarm sound is the primary alarm. It keeps playing when the screen is locked.
    try {
      await CustomAlarm.startAlarmSound();
      console.log("🔊 Native alarm sound started");
    } catch (error) {
      console.error("Native alarm sound error:", error);
    }

    // Web audio is only a fallback while React is visible.
    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        await audioRef.current.play();
      }
    } catch (error) {
      console.log("Web audio fallback error:", error);
    }

    // Start camera
    // -----------------------------------------------------

    console.log(
      "📷 Starting camera..."
    );

    await startCamera();

  };


  // =======================================================
  // START CAMERA
  // =======================================================

  const startCamera = async () => {

    try {

      setCameraError("");


      // Check browser support
      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {

        throw new Error(
          "Camera API is not supported."
        );

      }


      console.log(
        "📷 Requesting camera permission..."
      );


      const stream =
        await navigator.mediaDevices.getUserMedia({

          video: {

            facingMode: "user",

            width: {
              ideal: 640,
            },

            height: {
              ideal: 480,
            },

          },

          audio: false,

        });


      console.log(
        "✅ Camera permission granted"
      );


      streamRef.current =
        stream;


      if (!videoRef.current) {

        throw new Error(
          "Video element not available."
        );

      }


      videoRef.current.srcObject =
        stream;


      await videoRef.current.play();


      console.log(
        "🎥 Video started"
      );


      // Start MediaPipe
      await initializePoseLandmarker();


    } catch (error) {

      console.error(
        "❌ Camera error:",
        error
      );


      setCameraError(
        "Camera permission is required. Please allow camera access."
      );

    }

  };


  // =======================================================
  // INITIALIZE MEDIAPIPE
  // =======================================================

  const initializePoseLandmarker =
    async () => {

      try {

        console.log(
          "🧠 Initializing MediaPipe..."
        );


        const vision =
          await FilesetResolver.forVisionTasks(

            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"

          );


        console.log(
          "✅ MediaPipe WASM loaded"
        );


        const poseLandmarker =
          await PoseLandmarker.createFromOptions(
            vision,
            {

              baseOptions: {

                modelAssetPath:
                  poseModel,

                delegate: "GPU",

              },

              runningMode: "VIDEO",

              numPoses: 1,

            }
          );


        poseLandmarkerRef.current =
          poseLandmarker;


        console.log(
          "✅ MediaPipe initialized"
        );


        // Start detection
        detectingRef.current =
          true;

        detectMovement();


      } catch (error) {

        console.error(
          "❌ MediaPipe error:",
          error
        );


        setCameraError(
          "Failed to initialize motion tracking. Please check your internet connection."
        );

      }

    };


  // =======================================================
  // MOVEMENT DETECTION
  // =======================================================

  const detectMovement = () => {

    if (!detectingRef.current) {
      return;
    }


    if (
      !videoRef.current ||
      !poseLandmarkerRef.current
    ) {

      animationFrameRef.current =
        requestAnimationFrame(
          detectMovement
        );

      return;

    }


    const video =
      videoRef.current;


    const currentChallenge =
      challengeRef.current;


    // -----------------------------------------------------
    // Make sure video is ready
    // -----------------------------------------------------

    if (video.readyState >= 2) {

      try {

        const timestamp =
          performance.now();


        const result =
          poseLandmarkerRef.current
            .detectForVideo(
              video,
              timestamp
            );


        // -------------------------------------------------
        // Check if body detected
        // -------------------------------------------------

        if (
          result.landmarks &&
          result.landmarks.length > 0
        ) {

          const landmarks =
            result.landmarks[0];


          // =================================================
          // MOVE FOR 10 SECONDS
          // =================================================

          if (
            currentChallenge ===
            "move"
          ) {

            const leftShoulder =
              landmarks[11];

            const rightShoulder =
              landmarks[12];

            const leftHip =
              landmarks[23];

            const rightHip =
              landmarks[24];


            const centerX =
              (
                leftShoulder.x +
                rightShoulder.x +
                leftHip.x +
                rightHip.x
              ) / 4;


            const centerY =
              (
                leftShoulder.y +
                rightShoulder.y +
                leftHip.y +
                rightHip.y
              ) / 4;


            const currentPosition = {
              x: centerX,
              y: centerY,
            };


            if (
              previousPositionRef.current
            ) {

              const dx =
                currentPosition.x -
                previousPositionRef.current.x;


              const dy =
                currentPosition.y -
                previousPositionRef.current.y;


              const movementDistance =
                Math.sqrt(
                  dx * dx +
                  dy * dy
                );


              // Movement threshold
              if (
                movementDistance >
                0.012
              ) {

                setMovementDetected(
                  true
                );


                const currentTime =
                  performance.now();


                if (
                  lastFrameTimeRef.current
                ) {

                  const elapsed =
                    (
                      currentTime -
                      lastFrameTimeRef.current
                    ) / 1000;


                  movingTimeRef.current +=
                    elapsed;


                  const seconds =
                    Math.min(
                      10,
                      Math.floor(
                        movingTimeRef.current
                      )
                    );


                  setMovementSeconds(
                    seconds
                  );


                  // Challenge complete
                  if (
                    movingTimeRef.current >=
                    10
                  ) {

                    stopAlarm();

                    return;

                  }

                }


                lastFrameTimeRef.current =
                  currentTime;

              } else {

                setMovementDetected(
                  false
                );

              }

            }


            previousPositionRef.current =
              currentPosition;

          }


          // =================================================
          // SQUATS — STRICT DETECTION
          else if (currentChallenge === "squats") {
            const leftShoulder = landmarks[11];
            const rightShoulder = landmarks[12];
            const leftHip = landmarks[23];
            const rightHip = landmarks[24];
            const leftKnee = landmarks[25];
            const rightKnee = landmarks[26];
            const leftAnkle = landmarks[27];
            const rightAnkle = landmarks[28];

            const points = [leftShoulder,rightShoulder,leftHip,rightHip,leftKnee,rightKnee,leftAnkle,rightAnkle];
            const visible = points.every(p => p && (p.visibility === undefined || p.visibility > 0.5));

            if (!visible) {
              setMovementDetected(false);
            } else {
              const leftKneeAngle = calculateAngle(leftHip,leftKnee,leftAnkle);
              const rightKneeAngle = calculateAngle(rightHip,rightKnee,rightAnkle);
              const hipY = (leftHip.y + rightHip.y) / 2;
              const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
              const bodyHeight = Math.max(0.001, Math.abs(hipY - shoulderY));
              const state = squatStateRef.current;

              const standing = leftKneeAngle > 160 && rightKneeAngle > 160;

              // Establish standing baseline before accepting a squat.
              if (state.standingHipY === null && standing) {
                state.standingHipY = hipY;
                state.phase = "standing";
                state.downFrames = 0;
              }

              if (state.standingHipY !== null) {
                const hipDrop = hipY - state.standingHipY;
                const bothKneesBent = leftKneeAngle < 120 && rightKneeAngle < 120;
                const enoughDepth = hipDrop > Math.max(0.04, bodyHeight * 0.12);
                const validDown = bothKneesBent && enoughDepth;

                if (state.phase === "standing") {
                  if (validDown) {
                    state.downFrames += 1;
                    if (state.downFrames >= 3) {
                      state.phase = "down";
                      setMovementDetected(true);
                      console.log("⬇️ Valid squat down");
                    }
                  } else {
                    state.downFrames = 0;
                    setMovementDetected(false);
                  }
                } else if (state.phase === "down") {
                  setMovementDetected(true);

                  // Count only after the user returns to standing.
                  if (standing) {
                    state.phase = "standing";
                    state.downFrames = 0;
                    state.standingHipY = hipY;

                    repCountRef.current += 1;
                    setRepCount(repCountRef.current);
                    setMovementDetected(false);

                    console.log("🏋️ Valid squat:", repCountRef.current);

                    if (repCountRef.current >= 5) {
                      stopAlarm();
                      return;
                    }
                  }
                }
              }
            }
          }

          // JUMPING JACKS
          // =================================================

          else if (
            currentChallenge ===
            "jumping-jacks"
          ) {

            const leftWrist =
              landmarks[15];

            const rightWrist =
              landmarks[16];

            const leftShoulder =
              landmarks[11];

            const rightShoulder =
              landmarks[12];


            const handsUp =
              leftWrist.y <
                leftShoulder.y &&
              rightWrist.y <
                rightShoulder.y;


            if (handsUp) {

              setMovementDetected(
                true
              );


              if (
                exerciseStateRef.current !==
                "out"
              ) {

                exerciseStateRef.current =
                  "out";

              }

            }


            else {

              setMovementDetected(
                false
              );


              if (
                exerciseStateRef.current ===
                "out"
              ) {

                exerciseStateRef.current =
                  "in";


                repCountRef.current +=
                  1;


                setRepCount(
                  repCountRef.current
                );


                console.log(
                  "🤸 Jumping Jack:",
                  repCountRef.current
                );


                if (
                  repCountRef.current >=
                  5
                ) {

                  stopAlarm();

                  return;

                }

              }

            }

          }

        }

      } catch (error) {

        console.error(
          "❌ Detection error:",
          error
        );

      }

    }


    // Continue detection
    animationFrameRef.current =
      requestAnimationFrame(
        detectMovement
      );

  };


  // =======================================================
  // STOP ALARM
  // =======================================================

  const stopAlarm = () => {

    console.log(
      "🎉🎉 CHALLENGE COMPLETED 🎉🎉"
    );


    // Stop animation
    if (
      animationFrameRef.current
    ) {

      cancelAnimationFrame(
        animationFrameRef.current
      );

      animationFrameRef.current =
        null;

    }


    detectingRef.current =
      false;


    // Stop alarm UI
    setAlarmRinging(false);

    setAlarmSet(false);

    setChallengeComplete(true);


    // Use current challenge
    const currentChallenge =
      challengeRef.current;


    if (
      currentChallenge ===
      "move"
    ) {

      setMovementSeconds(10);

    } else {

      setRepCount(5);

    }


    // Stop native foreground alarm sound.
    CustomAlarm.stopAlarmSound().catch((error) => {
      console.log("Native alarm stop error:", error);
    });

    // Stop alarm audio
    if (audioRef.current) {

      audioRef.current.pause();

      audioRef.current.currentTime =
        0;

    }


    // Stop camera
    if (streamRef.current) {

      streamRef.current
        .getTracks()
        .forEach((track) => {

          track.stop();

        });


      streamRef.current =
        null;

    }


    // Close MediaPipe
    if (
      poseLandmarkerRef.current
    ) {

      try {

        poseLandmarkerRef.current.close();

      } catch (error) {

        console.log(
          "MediaPipe close error:",
          error
        );

      }


      poseLandmarkerRef.current =
        null;

    }


    // Reset refs
    previousPositionRef.current =
      null;

    lastFrameTimeRef.current =
      null;

    movingTimeRef.current =
      0;

    exerciseStateRef.current =
      "start";


    squatStateRef.current = { phase: "standing", standingHipY: null, downFrames: 0 };
  };


  // =======================================================
  // CANCEL ALARM
  // =======================================================

  const cancelAlarm = async () => {

    console.log(
      "❌ Canceling alarm..."
    );


    setAlarmSet(false);

    setAlarmTime("");


    try {

      await CustomAlarm.cancelAlarm();
      await CustomAlarm.stopAlarmSound();


      console.log(
        "✅ Alarm canceled"
      );

    } catch (error) {

      console.log(
        "Error canceling alarm:",
        error
      );

    }

  };


  // =======================================================
  // CLEANUP
  // =======================================================

  useEffect(() => {

    return () => {

      console.log(
        "🧹 Cleaning up Move2Wake..."
      );


      detectingRef.current =
        false;


      if (
        animationFrameRef.current
      ) {

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


      if (
        poseLandmarkerRef.current
      ) {

        try {

          poseLandmarkerRef.current.close();

        } catch (error) {

          console.log(
            "MediaPipe cleanup error:",
            error
          );

        }

      }

    };

  }, []);


  // =======================================================
  // PROGRESS
  // =======================================================

  const isMoveChallenge =
    challenge === "move";


  const currentValue =
    isMoveChallenge
      ? movementSeconds
      : repCount;


  const targetValue =
    isMoveChallenge
      ? 10
      : 5;


  const progressPercentage =
    Math.min(
      100,
      (currentValue / targetValue) *
        100
    );


  // =======================================================
  // UI
  // =======================================================

  return (

    <div className="app">


      {/* =================================================
          ALARM AUDIO
      ================================================= */}

      <audio
        ref={audioRef}
        loop
      >

        <source
          src="/alarm.mp3"
          type="audio/mpeg"
        />

      </audio>


      {/* =================================================
          HEADER
      ================================================= */}

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


      {/* =================================================
          MAIN
      ================================================= */}

      <main className="main-content">


        {/* =================================================
            NORMAL HOME SCREEN
        ================================================= */}

        {!alarmRinging ? (

          <>


            {/* HERO */}

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


            {/* =================================================
                ALARM SETTING
            ================================================= */}

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


                {/* TIME */}

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
                    onChange={(event) => {

                      setChallenge(
                        event.target.value
                      );

                    }}
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


                {/* SET / CANCEL */}

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

                        await scheduleCapacitorNotification(
                          alarmTime
                        );


                        setAlarmSet(
                          true
                        );


                      } catch (error) {

                        alert(
                          "Error setting alarm:\n" +
                          error.message
                        );

                      }

                    }}
                  >

                    ⏰ Set Alarm

                  </button>

                ) : (

                  <button
                    className="cancel-button"
                    onClick={
                      cancelAlarm
                    }
                  >

                    Cancel Alarm

                  </button>

                )}

              </div>


              {/* =================================================
                  ALARM SET SUCCESS
              ================================================= */}

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

                        {challenge ===
                        "move"

                          ? "Move for 10 seconds"

                          : challenge ===
                            "squats"

                          ? "5 Squats"

                          : "5 Jumping Jacks"}

                      </b>

                    </p>

                  </div>

                </div>

              )}


              {/* =================================================
                  CHALLENGE COMPLETED
              ================================================= */}

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
                      Good morning!
                      Your alarm has stopped.
                    </p>

                  </div>

                </div>

              )}

            </section>

          </>

        ) : (


          /* =================================================
             ALARM / EXERCISE SCREEN
          ================================================= */

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


            {/* =================================================
                CAMERA
            ================================================= */}

            <div className="camera-container">

              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
              />


              <div className="camera-overlay">


                {/* COUNTER */}

                <div className="movement-counter">

                  {currentValue}

                  <span>
                    /{targetValue}
                  </span>

                </div>


                {/* STATUS */}

                <p>

                  {movementDetected

                    ? "Exercise action detected!"

                    : "Do the selected exercise!"}

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


            {/* =================================================
                PROGRESS BAR
            ================================================= */}

            <div className="progress-container">

              <div
                className="progress-bar"
                style={{
                  width:
                    `${progressPercentage}%`,
                }}
              ></div>

            </div>


            {/* PROGRESS TEXT */}

            <p className="progress-text">

              {isMoveChallenge

                ? `${currentValue} seconds of movement completed`

                : `${currentValue} reps completed`}

            </p>

          </section>

        )}

      </main>


      {/* =================================================
          FOOTER
      ================================================= */}

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