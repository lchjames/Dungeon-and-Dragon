<?php

$pc = $pl = $age = $gender = "";
$STR = $DEX = $CON = $APP = $POW = $INT = $SIZ = $EDU = $SAN = $IDEA = $LUCK = $KNOW = "0";
$pcErr = $plErr = $ageErr = $genderErr = $STRErr = $DEXErr = $CONErr = $APPErr = $POWErr = $INTErr = $SIZErr = $EDUErr = $SANErr = "";
$allowtoinput = TRUE;
setini();
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $STR = test_input($_POST["STR"]);
    $DEX = test_input($_POST["DEX"]);
    $CON = test_input($_POST["CON"]);
    $APP = test_input($_POST["APP"]);
    $POW = test_input($_POST["POW"]);
    $INT = test_input($_POST["INT"]);
    $SIZ = test_input($_POST["SIZ"]);
    $EDU = test_input($_POST["EDU"]);
    if (isset($_POST['submit'])) {
        if (empty($_POST["pc"])) {
            $pcErr = "Character's name is required";
        } else {
            $pc = test_input($_POST["pc"]);
            // check if name only contains letters and whitespace
            if (!preg_match("/^[a-zA-Z ]*$/", $pc)) {
                $pcErr = "Only letters and white space allowed";
                $allowtoinput = FALSE;
            }
        }

        if (empty($_POST["pl"])) {
            $plErr = "Player's name is required";
        } else {
            $pl = test_input($_POST["pl"]);
            // check if name only contains letters and whitespace
            if (!preg_match("/^[a-zA-Z ]*$/", $pl)) {
                $plErr = "Only letters and white space allowed";
                $allowtoinput = FALSE;
            }
        }

        if (empty($_POST["age"])) {
            $ageErr = "Character's age is required";
            $allowtoinput = FALSE;
        } else {
            $age = test_input($_POST["age"]);
        }

        if (empty($_POST["gender"])) {
            $genderErr = "Gender is required";
            $allowtoinput = FALSE;
        } else {
            $gender = test_input($_POST["gender"]);
        }

        if (empty($_POST["STR"])) {
            $STRErr = "Input is required";
            $allowtoinput = FALSE;
        } else
        if ($STR < 3 || $STR > 18) {
            $STRErr = "Input is not valid (Should be within 3-18)";
            $allowtoinput = FALSE;
        }

        if (empty($_POST["DEX"])) {
            $DEXErr = "Input is required";
            $allowtoinput = FALSE;
        } else
        if ($DEX < 3 || $DEX > 18) {
            $DEXErr = "Input is not valid (Should be within 3-18)";
            $allowtoinput = FALSE;
        }

        if (empty($_POST["CON"])) {
            $CONErr = "Input is required";
            $allowtoinput = FALSE;
        } else
        if ($CON < 3 || $CON > 18) {
            $CONErr = "Input is not valid (Should be within 3-18)";
            $allowtoinput = FALSE;
        }

        if (empty($_POST["APP"])) {
            $APPErr = "Input is required";
            $allowtoinput = FALSE;
        } else
        if ($APP < 3 || $APP > 18) {
            $APPErr = "Input is not valid (Should be within 3-18)";
            $allowtoinput = FALSE;
        }

        if (empty($_POST["POW"])) {
            $POWErr = "Input is required";
            $allowtoinput = FALSE;
        } else
        if ($POW < 3 || $POW > 18) {
            $POWErr = "Input is not valid (Should be within 3-18)";
            $allowtoinput = FALSE;
        }

        if (empty($_POST["INT"])) {
            $INTErr = "Input is required";
            $allowtoinput = FALSE;
        } else
        if ($INT < 3 || $INT > 18) {
            $INTErr = "Input is not valid (Should be within 3-18)";
            $allowtoinput = FALSE;
        }

        if (empty($_POST["SIZ"])) {
            $SIZErr = "Input is required";
            $allowtoinput = FALSE;
        } else
        if ($SIZ < 3 || $SIZ > 18) {
            $SIZErr = "Input is not valid (Should be within 3-18)";
            $allowtoinput = FALSE;
        }

        if (empty($_POST["EDU"])) {
            $EDUErr = "Input is required";
            $allowtoinput = FALSE;
        } else
        if ($EDU < 3 || $EDU > 18) {
            $EDUErr = "Input is not valid (Should be within 3-18)";
            $allowtoinput = FALSE;
        }
        if ($allowtoinput != FALSE) {
            $SAN = $POW * 5;
            $IDEA = $INT * 5;
            $LUCK = $POW * 5;
            $KNOW = $EDU * 5;
            if (include 'DBConnect.php') {
                $result = $conn->query("SELECT playername FROM playerinfo WHERE playername='$pl'");
                if ($result->num_rows == 0) {
                    $sql = "INSERT INTO playerinfo (playername, playercharacter, age, gender, strength, dexterous, constitution, appearance, power, intelligence, size, education, sanity, idea, luck, know)
    VALUES ('$pl', '$pc', '$age', '$gender', '$STR', '$DEX', '$CON', '$APP', '$POW', '$INT', '$SIZ', '$EDU', '$SAN', '$IDEA', '$LUCK', '$KNOW')";
                    if ($conn->query($sql) === FALSE) {
                        echo "Error: " . $sql . "<br>" . $conn->error;
                    }
                    header("Location:player.php");
                } else {
                    print "Player exists";
                }
            }
            $conn->close();
        }
    }
    if (isset($_POST['gorandom'])) {
        $STR = doran();
        $DEX = doran();
        $CON = doran();
        $APP = doran();
        $POW = doran();
        $INT = doran();
        $SIZ = doran();
        $EDU = doran();
    }
}

function doran() {
    $num = rand(3, 15);
    return $num;
}

function setini() {
    $pc = $pl = $age = $gender = "";
    $STR = $DEX = $CON = $APP = $POW = $INT = $SIZ = $EDU = $SAN = $IDEA = $LUCK = $KNOW = "0";
    $pcErr = $plErr = $ageErr = $genderErr = $STRErr = $DEXErr = $CONErr = $APPErr = $POWErr = $INTErr = $SIZErr = $EDUErr = $SANErr = "";
    $allowtoinput = TRUE;
    return;
}

function test_input($data) {
    $data = trim($data);
    $data = stripslashes($data);
    $data = htmlspecialchars($data);
    return $data;
}
?>

