    <?php
            $pc = $pl = $age = $gender = $STR = $DEX = $CON = $APP = $POW = $INT = $SIZ = $EDU = $SAN = $IDEA = $LUCK = $KNOW = "";
            $pcErr = $plErr = $ageErr = $genderErr = $STRErr = $DEXErr = $CONErr = $APPErr = $POWErr = $INTErr = $SIZErr = $EDUErr = $SANErr = "";
            if ($_SERVER["REQUEST_METHOD"] == "POST") {
                if (empty($_POST["pc"])) {
                    $pcErr = "Character's name is required";
                } else {
                    $pc = test_input($_POST["pc"]);
                    // check if name only contains letters and whitespace
                    if (!preg_match("/^[a-zA-Z ]*$/", $pc)) {
                        $pcErr = "Only letters and white space allowed";
                    }
                }

                if (empty($_POST["pl"])) {
                    $plErr = "Player's name is required";
                } else {
                    $pl = test_input($_POST["pl"]);
                    // check if name only contains letters and whitespace
                    if (!preg_match("/^[a-zA-Z ]*$/", $pl)) {
                        $plErr = "Only letters and white space allowed";
                    }
                }

                if (empty($_POST["age"])) {
                    $ageErr = "Character's age is required";
                } else {
                    $age = test_input($_POST["age"]);
                }

                if (empty($_POST["gender"])) {
                    $genderErr = "Gender is required";
                } else {
                    $gender = test_input($_POST["gender"]);
                }

                if ($STR < 0 || $STR > 20) {
                    $STRErr = "Input is not valid";
                } else {
                    $STR = test_input($_POST["STR"]);
                }
                if ($DEX < 0 || $DEX > 20) {
                    $DEXErr = "Input is not valid";
                } else {
                    $DEX = test_input($_POST["DEX"]);
                }

                if ($CON < 0 || $CON > 20) {
                    $CONErr = "Input is not valid";
                } else {
                    $CON = test_input($_POST["CON"]);
                }

                if ($APP < 0 || $APP > 20) {
                    $APPErr = "Input is not valid";
                } else {
                    $APP = test_input($_POST["APP"]);
                }

                if ($POW < 0 || $POW > 20) {
                    $POWErr = "Input is not valid";
                } else {
                    $POW = test_input($_POST["POW"]);
                }

                if ($INT < 0 || $INT > 20) {
                    $INTErr = "Input is not valid";
                } else {
                    $INT = test_input($_POST["INT"]);
                }

                if ($SIZ < 0 || $SIZ > 20) {
                    $SIZErr = "Input is not valid";
                } else {
                    $SIZ = test_input($_POST["SIZ"]);
                }

                if ($EDU < 0 || $EDU > 20) {
                    $EDUErr = "Input is not valid";
                } else {
                    $EDU = test_input($_POST["EDU"]);
                }

                $SAN = $POW * 5;
                $IDEA = $INT * 5;
                $LUCK = $POW * 5;
                $KNOW = $EDU * 5;
            }

            function test_input($data) {
                $data = trim($data);
                $data = stripslashes($data);
                $data = htmlspecialchars($data);
                return $data;
            }
            ?>
            <inputfield>
                <p><span class="error">* required field</span></p>
                <form method="post" action="<?php echo htmlspecialchars($_SERVER["PHP_SELF"]); ?>">  
                    探索者姓名(PC): <input type="text" name="pc">
                    <span class="error">* <?php echo $pcErr; ?></span><br>
                    玩家姓名(PL): <input type="text" name="pl">
                    <span class="error">* <?php echo $plErr; ?></span><br>
                    年齡: <input type="text" name="age">
                    <span class="error">* <?php echo $ageErr; ?></span><br>
                    Gender:
                    <input type="radio" name="gender" <?php if (isset($gender) && $gender == "Male") echo "checked"; ?> value="Male">Male
                    <input type="radio" name="gender" <?php if (isset($gender) && $gender == "Female") echo "checked"; ?> value="Female">Female
                    <input type="radio" name="gender" <?php if (isset($gender) && $gender == "Other") echo "checked"; ?> value="Other">Other  
                    <span class="error">* <?php echo $genderErr; ?></span><br>
                    <b>屬性</b><br>
                    力量: <input type="text" name="STR"><span class="error"><?php echo $STRErr; ?></span><br>你的角色執行推、拉、搬動等動作時所需的能力<br>
                    敏捷: <input type="text" name="DEX"><span class="error"><?php echo $DEXErr; ?></span><br>代表你的肢體靈巧、協調、速度等，戰鬥時的先後順位<br>
                    體質: <input type="text" name="CON"><span class="error"><?php echo $CONErr; ?></span><br>這個包括了身體素質，活力和精力。可能是憋氣的多寡或是毒抗<br>
                    外表: <input type="text" name="APP"><span class="error"><?php echo $APPErr; ?></span><br>會給人強烈的第一印象，好看的外表讓你更利於與NPC交涉<br>
                    意志: <input type="text" name="POW"><span class="error"><?php echo $POWErr; ?></span><br>意志力堅強的人較不容易動搖，重要的SAN值也是依此決定<br>
                    智力: <input type="text" name="INT"><span class="error"><?php echo $INTErr; ?></span><br>角色對事物的理解能力，但有時候知道太多並不是好事<br>
                    體型: <input type="text" name="SIZ"><span class="error"><?php echo $SIZErr; ?></span><br>體型大的人在肉搏戰可能佔有優勢，體型小也有行動便利的優點<br>
                    教育: <input type="text" name="EDU"><span class="error"><?php echo $EDUErr; ?></span><br>通常70等於一般大學程度<br>
                    <input type="submit" name="submit" value="Submit">  
                </form>
            </inputfield>
