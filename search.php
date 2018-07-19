<?php
$search = FALSE;
$pl = "";
$plErr = "";
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $search = TRUE;
    if (empty($_POST["pl"])) {
        $plErr = "Player's name is required";
        $search = FALSE;
    } else {
        $pl = test_input($_POST["pl"]);
// check if name only contains letters and whitespace
        if (!preg_match("/^[a-zA-Z ]*$/", $pl)) {
            $plErr = "Only letters and white space allowed";
            $search = FALSE;
        }
    }
    if ($search) {
        include_once 'getdata_player.php';
    }
}
if (!$search) {
    ?>
    <inputfield>
        <form method="post" action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>" autocomplete="off">  
            玩家姓名(PL): <input type="text" name="pl">
            <span class="error">* <?php echo $plErr; ?></span><br>
            <input type="submit" name="submit" value="Submit">  
        </form>
    </inputfield>
    <?php
}

function test_input($data) {
    $data = trim($data);
    $data = stripslashes($data);
    $data = htmlspecialchars($data);
    return $data;
}
?>