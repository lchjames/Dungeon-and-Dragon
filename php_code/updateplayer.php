<?php

$pc = test_input($_POST["pc"]);
$pl = test_input($_POST["pl"]);
$age = test_input($_POST["age"]);
$gender = test_input($_POST["gender"]);
$STR = test_input($_POST["STR"]);
$DEX = test_input($_POST["DEX"]);
$CON = test_input($_POST["CON"]);
$APP = test_input($_POST["APP"]);
$POW = test_input($_POST["POW"]);
$INT = test_input($_POST["INT"]);
$SIZ = test_input($_POST["SIZ"]);
$EDU = test_input($_POST["EDU"]);
$SAN = test_input($_POST["SAN"]);
$IDEA = test_input($_POST["IDEA"]);
$LUCK = test_input($_POST["LUCK"]);
$KNOW = test_input($_POST["KNOW"]);
if (include_once 'DBConnect.php') {
    $sql = "UPDATE playerinfo SET age = '$age', gender = '$gender', strength = '$STR', dexterous = '$DEX',
            constitution = '$CON', appearance = '$APP', power = '$POW', intelligence = '$INT', size = '$SIZ', education = '$EDU', sanity = '$SAN', idea = '$IDEA', luck = '$LUCK', know = '$KNOW'
            WHERE playername = '$pl' && playercharacter = '$pc'";
    if ($conn->query($sql) === FALSE) {
        echo "Error: " . $sql . "<br>" . $conn->error;
    }
}

function test_input($data) {
    $data = trim($data);
    $data = stripslashes($data);
    $data = htmlspecialchars($data);
    return $data;
}

$conn->close();
?>

